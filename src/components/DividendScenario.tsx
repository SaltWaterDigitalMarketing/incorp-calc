// src/components/DividendScenario.tsx
import { useMemo, useState } from "react";

/* ================================
   Dividend rules (Canada, 2025)
   ================================ */

// Gross-up factors applied to cash dividends to get taxable amount
const GROSS_UP = {
  eligible: 1.38,     // 38% gross-up
  nonEligible: 1.15,  // 15% gross-up
} as const;

// Federal Dividend Tax Credit rates (as a % of the grossed-up amount)
const FED_DTC_RATE = {
  eligible: 0.150198,   // 15.0198%
  nonEligible: 0.090301, // 9.0301%
} as const;

// BC Dividend Tax Credit rates (as a % of the grossed-up amount)
const BC_DTC_RATE = {
  eligible: 0.12,     // 12.00%
  nonEligible: 0.0196, // 1.96%
} as const;

/* ================================
   2025 Brackets (federal + BC)
   ================================ */

const FED_BRACKETS_2025: Array<[number, number]> = [
  [55_867, 0.15],
  [111_733, 0.205],
  [173_205, 0.26],
  [246_752, 0.29],
  [Number.POSITIVE_INFINITY, 0.33],
];

const BC_BRACKETS_2025: Array<[number, number]> = [
  [47_937, 0.0506],
  [95_875, 0.077],
  [110_076, 0.105],
  [133_664, 0.1229],
  [181_232, 0.147],
  [252_752, 0.168],
  [Number.POSITIVE_INFINITY, 0.205],
];

/* ================================
   Basic Personal Amounts (2025)
   ================================ */

const FED_BPA = 16_103;
const FED_BPA_RATE = 0.15;     // credit at lowest federal rate
const BC_BPA  = 12_580;
const BC_BPA_RATE = 0.0506;    // credit at lowest BC rate

/* ================================
   Helpers
   ================================ */

function progressiveTax(taxable: number, brackets: Array<[number, number]>): number {
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    const amt = Math.max(0, Math.min(taxable, cap) - prev);
    if (amt <= 0) break;
    tax += amt * rate;
    prev = cap;
    if (taxable <= cap) break;
  }
  return tax;
}

/** Apply non-refundable credits in one step (cannot go below zero). */
function applyNonRefundableCredits(grossTax: number, totalCredits: number) {
  return Math.max(0, grossTax - Math.max(0, totalCredits));
}

/* ================================
   Personal dividend tax — combined
   (BPA applied once across both)
   ================================ */

function personalDividendTaxCombined(eligibleCash: number, nonEligibleCash: number) {
  const eligGrossed = Math.max(0, eligibleCash) * GROSS_UP.eligible;
  const nonEligGrossed = Math.max(0, nonEligibleCash) * GROSS_UP.nonEligible;
  const grossedTotal = eligGrossed + nonEligGrossed;

  // Gross tax on combined grossed-up income
  const fedTaxGross = progressiveTax(grossedTotal, FED_BRACKETS_2025);
  const bcTaxGross  = progressiveTax(grossedTotal,  BC_BRACKETS_2025);

  // DTCs are computed on each class's grossed-up base
  const fedDTC = eligGrossed * FED_DTC_RATE.eligible + nonEligGrossed * FED_DTC_RATE.nonEligible;
  const bcDTC  = eligGrossed * BC_DTC_RATE.eligible  + nonEligGrossed * BC_DTC_RATE.nonEligible;

  // BPA once
  const fedBpaCredit = FED_BPA * FED_BPA_RATE;
  const bcBpaCredit  = BC_BPA  * BC_BPA_RATE;

  const fedNet = applyNonRefundableCredits(fedTaxGross, fedDTC + fedBpaCredit);
  const bcNet  = applyNonRefundableCredits(bcTaxGross,  bcDTC  + bcBpaCredit);

  const personalTax = fedNet + bcNet;

  return {
    personalTax,
    federalTax: fedNet,
    provincialTax: bcNet,
    taxableAmount: grossedTotal,
  };
}

/** Solve eligible dividend amount given a fixed non-eligible amount and a target net. */
function solveEligibleGivenNonEligible(
  targetNet: number,
  nonEligibleFixed: number,
  eligCap: number
) {
  const netAt = (x: number) => {
    const det = personalDividendTaxCombined(x, nonEligibleFixed);
    return x + nonEligibleFixed - det.personalTax;
  };

  // If even full cap can't reach target, use the cap
  if (netAt(eligCap) < targetNet - 0.01) return eligCap;

  let low = 0;
  let high = Math.max(eligCap, 1);
  let lastMid = high;

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const n = netAt(mid);
    if (Math.abs(n - targetNet) <= 0.01 || Math.abs(mid - lastMid) <= 0.01) return Math.min(mid, eligCap);
    if (n < targetNet) low = mid; else high = mid;
    lastMid = mid;
  }
  return Math.min(lastMid, eligCap);
}

/** Mirror helper: solve non-eligible given a fixed eligible amount and a target net. */
function solveNonEligibleGivenEligible(
  targetNet: number,
  eligibleFixed: number,
  neCap: number
) {
  const netAt = (ne: number) => {
    const det = personalDividendTaxCombined(eligibleFixed, ne);
    return eligibleFixed + ne - det.personalTax;
  };

  if (netAt(neCap) < targetNet - 0.01) return neCap;

  let low = 0, high = Math.max(neCap, 1), lastMid = high;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const n = netAt(mid);
    if (Math.abs(n - targetNet) <= 0.01 || Math.abs(mid - lastMid) <= 0.01) {
      return Math.min(mid, neCap);
    }
    if (n < targetNet) low = mid; else high = mid;
    lastMid = mid;
  }
  return Math.min(lastMid, neCap);
}

/** Convenience: net from a combined cash dividend. */
const netCombined = (eligibleCash: number, nonEligibleCash: number) => {
  const det = personalDividendTaxCombined(eligibleCash, nonEligibleCash);
  return eligibleCash + nonEligibleCash - det.personalTax;
};

/* ================================
   Exported calculator (auto-mix, ELIGIBLE FIRST)
   ================================ */

export function calculateIncorporatedDividends(params: {
  businessIncome: number;           // corp revenue before tax
  personalCashNeeded: number;       // target net cash to person
  otherExpenses?: number;           // optional corp expenses
}) {
  const { businessIncome, personalCashNeeded, otherExpenses = 0 } = params;

  // 1) Corporate profit & split into pools (BC CCPC 2025)
  const SBD_LIMIT = 500_000;
  const RATE_SBD = 0.11;  // small-business rate → NON-eligible
  const RATE_GEN = 0.27;  // general rate → ELIGIBLE

  const profitBeforeTax = Math.max(0, businessIncome - (otherExpenses || 0));
  const sbdBase = Math.min(profitBeforeTax, SBD_LIMIT);
  const genBase = Math.max(0, profitBeforeTax - SBD_LIMIT);

  const taxSBD = sbdBase * RATE_SBD;
  const taxGEN = genBase * RATE_GEN;
  const corporateTaxes = taxSBD + taxGEN;

  const neCap = sbdBase - taxSBD; // NON-eligible capacity
  const elCap = genBase - taxGEN; // ELIGIBLE capacity
  const afterTaxTotal = neCap + elCap;

  const target = Math.max(0, personalCashNeeded);

  // 2) Try to hit the target using ELIGIBLE only
  let eligibleDividends = 0;
  let nonEligibleDividends = 0;

  const eligOnly = solveEligibleGivenNonEligible(target, 0, elCap);
  if (netCombined(eligOnly, 0) + 0.01 >= target) {
    // Eligible alone can meet the goal (and is within cap by construction)
    eligibleDividends = eligOnly;
  } else {
    // Use full eligible capacity first...
    eligibleDividends = elCap;

    // ...then top up with non-eligible as needed (respect cap)
    const neNeeded = solveNonEligibleGivenEligible(target, eligibleDividends, neCap);
    nonEligibleDividends = Math.min(neNeeded, neCap);
  }

  // Final (safer caps)
  eligibleDividends = Math.min(eligibleDividends, elCap);
  nonEligibleDividends = Math.min(nonEligibleDividends, neCap);

  // 3) Personal tax on the combined dividends (BPA once, DTCs per class)
  const det = personalDividendTaxCombined(eligibleDividends, nonEligibleDividends);
  const personalTaxes = det.personalTax;
  const personalCash  = eligibleDividends + nonEligibleDividends - personalTaxes;

  // 4) Corporate cash retained after paying dividends
  const corporateCash = afterTaxTotal - eligibleDividends - nonEligibleDividends;

  // Totals/ratios
  const totalCPP = 0; // dividends don't trigger CPP
  const totalTaxes = personalTaxes + corporateTaxes;
  const totalCash  = personalCash + corporateCash;
  const totalTaxRate = businessIncome > 0 ? (totalTaxes + totalCPP) / businessIncome : 0;

  // “Capped” indicator (couldn’t meet target because pools limited)
  const capped = netCombined(elCap, neCap) + 0.01 < target;

  return {
    scenario: "INC_DIVIDENDS" as const,

    // salary fields 0 in dividend-only
    grossSalary: 0,
    eligibleDividends,
    nonEligibleDividends,

    corporateTaxes,
    corporateCPP: 0,

    personalTaxes,
    totalTaxes,
    totalCPP,
    personalCPP: 0,

    corporateCash,
    personalCash,
    totalCash,
    totalTaxRate,

    rrspRoom: 0,

    // reporting (net amounts after credits)
    federalTax: det.federalTax,
    provincialTax: det.provincialTax,
    taxableIncome: det.taxableAmount,

    // debug flags
    _requiredDividendToHitTarget: eligibleDividends + nonEligibleDividends,
    _cappedByAfterTaxProfit: capped,
  };
}

/* ================================
   UI (default export)
   ================================ */

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 })
    : "—";

const pct = (n: number) =>
  Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—";

export default function DividendScenario() {
  const [businessIncome, setBusinessIncome] = useState(200_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState(100_000);
  const [otherExpenses, setOtherExpenses] = useState(0);

  const res = useMemo(
    () =>
      calculateIncorporatedDividends({
        businessIncome,
        personalCashNeeded,
        otherExpenses,
      }),
    [businessIncome, personalCashNeeded, otherExpenses]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold mb-3">Incorporated — Dividends</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Business Income (before tax)</span>
          <input
            type="number"
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={businessIncome}
            onChange={(e) => setBusinessIncome(parseFloat(e.target.value || "0"))}
          />
        </label>

        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Personal Cash Needed (target)</span>
          <input
            type="number"
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={personalCashNeeded}
            onChange={(e) => setPersonalCashNeeded(parseFloat(e.target.value || "0"))}
          />
        </label>

        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Other Corporate Expenses</span>
          <input
            type="number"
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={otherExpenses}
            onChange={(e) => setOtherExpenses(parseFloat(e.target.value || "0"))}
          />
        </label>
      </div>

      <div className="mt-3 text-xs text-slate-400 border border-white/10 rounded-xl p-3 bg-slate-900/50">
        <strong>Notes:</strong> BC CCPC 2025: 11% on first $500k of active business income
        (creates non-eligible pool), 27% above that (creates eligible pool).
        Personal dividend tax uses 2025 gross-up/credit rules (Fed 15.0198% / 9.0301%; BC 12% / 1.96%)
        with BPA applied once across the mix. Dividends do not trigger CPP.
      </div>

      <div className="space-y-2 mt-4">
        <Row label="Dividend paid — eligible" value={fmt(res.eligibleDividends || 0)} />
        <Row label="Dividend paid — non-eligible" value={fmt(res.nonEligibleDividends || 0)} />
        <Row
          label="Dividend paid (total)"
          value={fmt((res.eligibleDividends || 0) + (res.nonEligibleDividends || 0))}
          big
        />

        <Row label="Personal dividend taxes (after credits)" value={fmt(res.personalTaxes)} muted />
        <Row label="– Federal tax on grossed-up (net of credits)" value={fmt(res.federalTax!)} muted />
        <Row label="– Provincial tax on grossed-up (net of credits)" value={fmt(res.provincialTax!)} muted />
        <Row label="Net to you" value={fmt(res.personalCash)} />

        <Row label="Corporate profit (before corp tax)" value={fmt(res.totalCash + res.corporateTaxes)} />
        <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
        <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />

        <Row label="Total taxes (incl. CPP)" value={fmt(res.totalTaxes + res.totalCPP)} muted />
        <Row label="Effective tax rate (incl. CPP)" value={pct(res.totalTaxRate)} pill />

        <Row label="Taxable amount added (grossed-up)" value={fmt(res.taxableIncome!)} />

        {res._cappedByAfterTaxProfit && (
          <div className="text-amber-300 text-sm">
            Note: Available after-tax corporate profit capped the dividend below what was needed to hit your target.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  pill,
  big,
}: {
  label: string;
  value: string;
  muted?: boolean;
  pill?: boolean;
  big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 last:border-b-0 py-2">
      <div className={"text-sm " + (muted ? "text-slate-400" : "")}>{label}</div>
      <div
        className={
          (pill ? "px-2 py-0.5 rounded-full bg-white/5 border border-white/10 " : "") +
          (big ? "text-lg font-extrabold " : "") +
          " tabular-nums font-mono"
        }
      >
        {value}
      </div>
    </div>
  );
}
