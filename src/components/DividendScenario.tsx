// src/components/DividendScenario.tsx
import { useMemo, useState } from "react";

// ---- Dividend constants (2025) ----
const GROSS_UP = {
  eligible: 1.38, // 38% gross-up
  nonEligible: 1.15, // 15% gross-up
} as const;

// Federal dividend tax credits (percent of taxable/grossed-up amount)
// CRA line 40425 (2025): eligible 15.0198%, other-than-eligible 9.0301%
const FED_DTC_RATE = {
  eligible: 0.150198,
  nonEligible: 0.090301,
} as const;

// BC dividend tax credits (percent of taxable/grossed-up amount)
// BC 2025: eligible 12%, other-than-eligible 1.96%
const BC_DTC_RATE = {
  eligible: 0.12,
  nonEligible: 0.0196,
} as const;

// Reuse the same 2025 brackets used elsewhere
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

// --- Basic Personal Amounts (2025) ---
const FED_BPA = 16_103;
const FED_BPA_RATE = 0.15;
const BC_BPA = 12_580;
const BC_BPA_RATE = 0.0506;

function applyBasicCredits(fedGross: number, bcGross: number) {
  const fedCredit = FED_BPA * FED_BPA_RATE;
  const bcCredit = BC_BPA * BC_BPA_RATE;
  return {
    fedNet: Math.max(0, fedGross - fedCredit),
    bcNet: Math.max(0, bcGross - bcCredit),
    fedCredit,
    bcCredit,
  };
}

// ---- helpers ----
function progressiveTax(taxable: number, brackets: Array<[number, number]>): number {
  let tax = 0,
    prev = 0;
  for (const [cap, rate] of brackets) {
    const amt = Math.max(0, Math.min(taxable, cap) - prev);
    if (amt <= 0) break;
    tax += amt * rate;
    prev = cap;
    if (taxable <= cap) break;
  }
  return tax;
}

// Compute personal tax on a *cash* dividend given dividend type
// Order: gross tax on grossed-up amount -> minus dividend tax credits -> minus BPA credits
function personalDividendTax(divCash: number, type: "eligible" | "nonEligible") {
  const grossed = Math.max(0, divCash) * GROSS_UP[type]; // taxable amount added to income

  // Gross tax on the grossed-up amount
  const fedTaxGross = progressiveTax(grossed, FED_BRACKETS_2025);
  const bcTaxGross = progressiveTax(grossed, BC_BRACKETS_2025);

  // Dividend tax credits (federal & provincial) on the grossed-up amount
  const fedDTC = grossed * FED_DTC_RATE[type];
  const bcDTC = grossed * BC_DTC_RATE[type];

  // Net of dividend tax credits
  const fedAfterDTC = Math.max(0, fedTaxGross - fedDTC);
  const bcAfterDTC = Math.max(0, bcTaxGross - bcDTC);

  // Apply Basic Personal Amount credits on top
  const { fedNet, bcNet } = applyBasicCredits(fedAfterDTC, bcAfterDTC);

  const personalTax = Math.max(0, fedNet + bcNet);
  return {
    personalTax,
    fedTax: fedNet, // report NET after BPA
    bcTax: bcNet, // report NET after BPA
    fedDTC,
    bcDTC,
    taxableAmount: grossed,
  };
}

// Solve for cash dividend needed to hit a target personal net
function solveDividendForNet(targetNet: number, type: "eligible" | "nonEligible") {
  if (targetNet <= 0)
    return { dividendCash: 0, tax: 0, achievedNet: 0, details: null as any };
  let low = targetNet; // net <= divCash, so start here
  let high = Math.max(500_000, targetNet * 2);

  // expand until we can net the target
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

export function calculateIncorporatedDividends(params: {
  businessIncome: number; // corp revenue before tax
  personalCashNeeded: number; // target net to person (may be capped by available after-tax profit)
  corpTaxRatePct: number; // e.g., 11 or 27
  otherExpenses?: number; // optional corp expenses
  dividendType?: "eligible" | "nonEligible"; // default nonEligible
}) {
  const {
    businessIncome,
    personalCashNeeded,
    corpTaxRatePct,
    otherExpenses = 0,
    dividendType = "nonEligible",
  } = params;
  const corpRate = Math.max(0, corpTaxRatePct) / 100;

  // 1) Corporate profit and tax (no CPP in dividend scenario)
  const corpProfitBeforeTax = Math.max(0, businessIncome - (otherExpenses || 0));
  const corporateTaxes = corpProfitBeforeTax * corpRate;
  const afterTaxProfit = corpProfitBeforeTax - corporateTaxes; // max cash available for dividends

  // 2) Solve required dividend to meet target net
  const solved = solveDividendForNet(Math.max(0, personalCashNeeded), dividendType);
  const requiredDividend = solved.dividendCash;

  // 3) Cap by available after-tax profits (retain the rest)
  const dividendPaid = Math.min(afterTaxProfit, requiredDividend);
  const divTaxDet = personalDividendTax(dividendPaid, dividendType);
  const personalTaxes = divTaxDet.personalTax; // tax on dividends after DTC + BPA

  const personalCash = dividendPaid - personalTaxes; // net to person
  const corporateCash = afterTaxProfit - dividendPaid; // retained earnings

  // Totals/ratios (CPP = 0)
  const totalTaxes = personalTaxes + corporateTaxes;
  const totalCPP = 0;
  const totalCash = personalCash + corporateCash;
  const totalTaxRate = businessIncome > 0 ? totalTaxes / businessIncome : 0;

  return {
    scenario: "INC_DIVIDENDS" as const,
    grossSalary: 0, // no salary
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

    federalTax: divTaxDet.fedTax, // NET after BPA
    provincialTax: divTaxDet.bcTax, // NET after BPA
    taxableIncome: divTaxDet.taxableAmount, // grossed-up amount

    // extras for UX/debug
    _requiredDividendToHitTarget: requiredDividend,
    _requiredDividendNet: solved.achievedNet,
    _cappedByAfterTaxProfit: requiredDividend > afterTaxProfit,
  };
}

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
  const [corpTaxRatePct, setCorpTaxRatePct] = useState(11);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [dividendType, setDividendType] = useState<"eligible" | "nonEligible">(
    "nonEligible"
  );

  const res = useMemo(
    () =>
      calculateIncorporatedDividends({
        businessIncome,
        personalCashNeeded,
        corpTaxRatePct,
        otherExpenses,
        dividendType,
      }),
    [businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses, dividendType]
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
            onChange={(e) =>
              setBusinessIncome(parseFloat(e.target.value || "0"))
            }
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
            onChange={(e) =>
              setPersonalCashNeeded(parseFloat(e.target.value || "0"))
            }
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">
            Corporate Tax Rate (%)
          </span>
          <input
            type="number"
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={corpTaxRatePct}
            onChange={(e) =>
              setCorpTaxRatePct(parseFloat(e.target.value || "0"))
            }
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">
            Other Corporate Expenses
          </span>
          <input
            type="number"
            className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
            value={otherExpenses}
            onChange={(e) =>
              setOtherExpenses(parseFloat(e.target.value || "0"))
            }
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
        <strong>Notes:</strong> 2025 dividend gross-up (38%/15%) and credits
        (Fed 15.0198%/9.0301%; BC 12%/1.96%) applied to the taxable (grossed-up)
        amount, and **BPA credits** applied to the net result. AMT/other credits are ignored.
      </div>

      <div className="space-y-2 mt-4">
        <Row
          label="Dividend paid (cash)"
          value={fmt((res.eligibleDividends || 0) + (res.nonEligibleDividends || 0))}
          big
        />
        <Row
          label="Personal dividend taxes (after credits)"
          value={fmt(res.personalTaxes)}
          muted
        />
        <Row label="– Federal tax on grossed-up (net of BPA)" value={fmt(res.federalTax)} muted />
        <Row
          label="– Provincial tax on grossed-up (net of BPA)"
          value={fmt(res.provincialTax)}
          muted
        />
        <Row label="Net to you" value={fmt(res.personalCash)} />
        <Row
          label="Corporate profit (before corp tax)"
          value={fmt(res.totalCash + res.corporateTaxes)}
        />
        <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
        <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />
        <Row label="Total taxes (ex-CPP)" value={fmt(res.totalTaxes)} muted />
        <Row
          label="Effective tax rate (ex-CPP)"
          value={pct(res.totalTaxRate)}
          pill
        />
        <Row
          label="Taxable amount added (grossed-up)"
          value={fmt(res.taxableIncome)}
        />
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
          (pill
            ? "px-2 py-0.5 rounded-full bg-white/5 border border-white/10 "
            : "") +
          (big ? "text-lg font-extrabold " : "") +
          " tabular-nums font-mono"
        }
      >
        {value}
      </div>
    </div>
  );
}
