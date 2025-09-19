// src/components/DividendScenario.tsx
import { useMemo, useState } from "react";
import { computeCorporateTaxesBC } from "../engine/corporateTax_BC";

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
  nonEligible: 0.090301 // 9.0301%
} as const;

// BC Dividend Tax Credit rates (as a % of the grossed-up amount)
const BC_DTC_RATE = {
  eligible: 0.12,     // 12.00%
  nonEligible: 0.0196 // 1.96%
} as const;

/* ================================
   2025 Brackets (federal + BC)
   (kept local for this component)
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

/**
 * Apply non-refundable credits in one step (avoids order effects).
 * Credits cannot reduce tax below zero.
 */
function applyNonRefundableCredits(grossTax: number, totalCredits: number) {
  return Math.max(0, grossTax - Math.max(0, totalCredits));
}

/* ================================
   Personal dividend tax calculator
   ================================ */

/**
 * Computes personal tax on a *cash* dividend assuming dividends are the only income.
 * Pipeline:
 *   1) Gross-up cash dividend
 *   2) Compute gross federal/BC tax on the grossed-up amount
 *   3) Compute Dividend Tax Credits (fed + BC) on grossed-up amount
 *   4) Add BPA credits (fed + BC)
 *   5) Subtract combined non-refundable credits at each level
 */
function personalDividendTax(divCash: number, type: "eligible" | "nonEligible") {
  const grossed = Math.max(0, divCash) * GROSS_UP[type]; // taxable amount added to income

  // 1) Gross taxes on the grossed-up amount
  const fedTaxGross = progressiveTax(grossed, FED_BRACKETS_2025);
  const bcTaxGross  = progressiveTax(grossed, BC_BRACKETS_2025);

  // 2) Dividend tax credits (as % of grossed-up amount)
  const fedDTC = grossed * FED_DTC_RATE[type];
  const bcDTC  = grossed * BC_DTC_RATE[type];

  // 3) BPA credits (non-refundable) at lowest rates
  const fedBpaCredit = FED_BPA * FED_BPA_RATE;
  const bcBpaCredit  = BC_BPA  * BC_BPA_RATE;

  // 4) Combine non-refundable credits per jurisdiction, then apply once
  const fedCreditsTotal = fedDTC + fedBpaCredit;
  const bcCreditsTotal  = bcDTC  + bcBpaCredit;

  const fedNet = applyNonRefundableCredits(fedTaxGross, fedCreditsTotal);
  const bcNet  = applyNonRefundableCredits(bcTaxGross,  bcCreditsTotal);

  const personalTax = fedNet + bcNet;

  return {
    personalTax,           // total personal tax on dividends
    fedTax: fedNet,        // NET federal tax after DTC + BPA
    bcTax: bcNet,          // NET provincial tax after DTC + BPA
    fedDTC,
    bcDTC,
    taxableAmount: grossed // amount added to taxable income (grossed-up)
  };
}

/* ================================
   Solve: cash dividend to hit a net
   ================================ */

function solveDividendForNet(targetNet: number, type: "eligible" | "nonEligible") {
  if (targetNet <= 0) {
    return { dividendCash: 0, tax: 0, achievedNet: 0, details: null as any };
  }

  let low = targetNet; // net <= cash dividend; start at target
  let high = Math.max(500_000, targetNet * 2);

  // Expand until target net is achievable
  for (let i = 0; i < 20; i++) {
    const { personalTax } = personalDividendTax(high, type);
    const net = high - personalTax;
    if (net >= targetNet) break;
    high *= 2;
  }

  let lastMid = high;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (low + high) / 2;
    const det = personalDividendTax(mid, type);
    const net = mid - det.personalTax;

    if (Math.abs(net - targetNet) <= 0.01 || Math.abs(mid - lastMid) <= 0.01) {
      return {
        dividendCash: mid,
        tax: det.personalTax,
        achievedNet: net,
        details: det,
      };
    }
    if (net < targetNet) low = mid;
    else high = mid;
    lastMid = mid;
  }

  const det = personalDividendTax(lastMid, type);
  return {
    dividendCash: lastMid,
    tax: det.personalTax,
    achievedNet: lastMid - det.personalTax,
    details: det,
  };
}

/* ================================
   Exported calculator (no CPP)
   ================================ */

export function calculateIncorporatedDividends(params: {
  businessIncome: number;           // corp revenue before tax
  personalCashNeeded: number;       // target net cash to person
  otherExpenses?: number;           // optional corp expenses
  dividendType?: "eligible" | "nonEligible"; // default nonEligible
}) {
  const {
    businessIncome,
    personalCashNeeded,
    otherExpenses = 0,
    dividendType = "nonEligible",
  } = params;

  // 1) Corporate profit & tax (no CPP with dividends)
  const corpProfitBeforeTax = Math.max(0, businessIncome - (otherExpenses || 0));
  const { corporateTaxes } = computeCorporateTaxesBC(corpProfitBeforeTax);
  const afterTaxProfit = corpProfitBeforeTax - corporateTaxes; // available for dividends

  // 2) Solve required dividend to meet target personal net
  const solved = solveDividendForNet(Math.max(0, personalCashNeeded), dividendType);
  const requiredDividend = solved.dividendCash;

  // 3) Cap by available after-tax profits (retain the rest)
  const dividendPaid = Math.min(afterTaxProfit, requiredDividend);
  const divTaxDet = personalDividendTax(dividendPaid, dividendType);

  const personalTaxes = divTaxDet.personalTax;          // tax on dividends after DTC+BPA
  const personalCash  = dividendPaid - personalTaxes;   // net to person
  const corporateCash = afterTaxProfit - dividendPaid;  // retained earnings

  // Totals/ratios
  const totalCPP = 0; // dividend-only: no CPP
  const totalTaxes = personalTaxes + corporateTaxes;
  const totalCash  = personalCash + corporateCash;

  // ✅ Effective tax rate now INCLUDES CPP (here it's the same since totalCPP=0)
  const totalTaxRate = businessIncome > 0
    ? (totalTaxes + totalCPP) / businessIncome
    : 0;

  return {
    scenario: "INC_DIVIDENDS" as const,

    // Salary fields remain 0 in dividend-only
    grossSalary: 0,
    eligibleDividends: dividendType === "eligible" ? dividendPaid : 0,
    nonEligibleDividends: dividendType === "nonEligible" ? dividendPaid : 0,

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

    rrspRoom: 0, // dividends do not create RRSP room

    // Reporting (net after credits)
    federalTax: divTaxDet.fedTax,
    provincialTax: divTaxDet.bcTax,
    taxableIncome: divTaxDet.taxableAmount,

    // Extras for UX/debug
    _requiredDividendToHitTarget: requiredDividend,
    _requiredDividendNet: solved.achievedNet,
    _cappedByAfterTaxProfit: requiredDividend > afterTaxProfit,
  };
}

/* ================================
   UI
   ================================ */

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 2,
      })
    : "—";

const pct = (n: number) =>
  Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—";

export default function DividendScenario() {
  const [businessIncome, setBusinessIncome] = useState(200_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState(100_000);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [dividendType, setDividendType] = useState<"eligible" | "nonEligible">(
    "nonEligible"
  );

  const res = useMemo(
    () =>
      calculateIncorporatedDividends({
        businessIncome,
        personalCashNeeded,
        otherExpenses,
        dividendType,
      }),
    [businessIncome, personalCashNeeded, otherExpenses, dividendType]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold mb-3">Incorporated — Dividends</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">
            Business Income (before tax)
          </span>
          <input
            type="number"
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={businessIncome}
            onChange={(e) => setBusinessIncome(parseFloat(e.target.value || "0"))}
          />
        </label>

        <label className="text-sm">
          <span className="block text-slate-400 mb-1">
            Personal Cash Needed (target)
          </span>
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

        <label className="text-sm col-span-full">
          <span className="block text-slate-400 mb-1">Dividend Type</span>
          <select
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={dividendType}
            onChange={(e) => setDividendType(e.target.value as any)}
          >
            <option value="nonEligible">Non-eligible (SBD income)</option>
            <option value="eligible">Eligible (general rate income)</option>
          </select>
        </label>
      </div>

      <div className="mt-3 text-xs text-slate-400 border border-white/10 rounded-xl p-3 bg-slate-900/50">
        <strong>Notes:</strong> Corporate tax is auto-calculated for a BC CCPC at 2025 rates:
        11% on the first $500k of active business income (SBD limit), and 27% above that.
        Personal dividend tax uses 2025 gross-up/credit rules (Fed 15.0198%/9.0301%; BC 12%/1.96%)
        with BPA credits applied. AMT/other credits are ignored. Dividends do not trigger CPP.
      </div>

      <div className="space-y-2 mt-4">
        <Row
          label="Dividend paid (cash)"
          value={fmt((res.eligibleDividends || 0) + (res.nonEligibleDividends || 0))}
          big
        />
        <Row label="Personal dividend taxes (after credits)" value={fmt(res.personalTaxes)} muted />
        <Row label="– Federal tax on grossed-up (net of credits)" value={fmt(res.federalTax)} muted />
        <Row label="– Provincial tax on grossed-up (net of credits)" value={fmt(res.provincialTax)} muted />
        <Row label="Net to you" value={fmt(res.personalCash)} />

        <Row label="Corporate profit (before corp tax)" value={fmt(res.totalCash + res.corporateTaxes)} />
        <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
        <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />

        <Row label="Total taxes (incl. CPP)" value={fmt(res.totalTaxes + res.totalCPP)} muted />
        <Row label="Effective tax rate (incl. CPP)" value={pct(res.totalTaxRate)} pill />

        <Row label="Taxable amount added (grossed-up)" value={fmt(res.taxableIncome)} />

        {res._cappedByAfterTaxProfit && (
          <div className="text-amber-300 text-sm">
            Note: Available after-tax corporate profit capped the dividend below
            what was needed to hit your target.
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
