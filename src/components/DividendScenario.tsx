import React, { useMemo, useState } from "react";

/**
 * Incorporated with Salary — BC 2025 (React/TSX)
 * - CPP excluded from taxes (but reduces net; shown separately)
 * - Supports retained earnings (BusinessIncome can exceed amounts needed to fund personal cash goal)
 * - 2025 Federal + BC tax brackets; ignores credits/surtaxes
 * - Binary search solver to back into Gross Salary for a target Personal Cash Needed
 *
 * Drop this file anywhere in your React app, e.g. src/components/SalaryScenario.tsx
 * Requires Tailwind (for classes) but no external UI libs.
 */

// =========================
// 2025 CONSTANTS (Canada, BC)
// =========================
const CPP_BASIC_EXEMPTION = 3_500;
const CPP_YMPE = 68_500; // Tier 1 ceiling
const CPP_YAMPE = 73_200; // Tier 2 ceiling

// Employee & Employer shares (symmetric)
const CPP_RATE_T1 = 0.0595; // 5.95% each
const CPP_RATE_T2 = 0.02; // 2.00% each

// Federal brackets (2025)
const FED_BRACKETS_2025 = [
  { upTo: 55_867, rate: 0.15 },
  { upTo: 111_733, rate: 0.205 },
  { upTo: 173_205, rate: 0.26 },
  { upTo: 246_752, rate: 0.29 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.33 },
] as const;

// BC brackets (2025)
const BC_BRACKETS_2025 = [
  { upTo: 47_937, rate: 0.0506 },
  { upTo: 95_875, rate: 0.077 },
  { upTo: 110_076, rate: 0.105 },
  { upTo: 133_664, rate: 0.1229 },
  { upTo: 181_232, rate: 0.147 },
  { upTo: 252_752, rate: 0.168 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.205 },
] as const;

const RRSP_MAX_2025 = 32_490;
const RRSP_PCT = 0.18;

// =========================
// HELPERS
// =========================
function taxFromBrackets(income: number, brackets: readonly { upTo: number; rate: number }[]) {
  let remaining = Math.max(0, income);
  let lower = 0;
  let tax = 0;
  for (const { upTo, rate } of brackets) {
    const band = Math.min(remaining, upTo - lower);
    if (band > 0) {
      tax += band * rate;
      remaining -= band;
      lower = upTo;
    }
    if (remaining <= 0) break;
  }
  return tax;
}

function calcCPPEmployee(gross: number) {
  const s = Math.max(0, gross);
  const t1Base = Math.max(0, Math.min(s - CPP_BASIC_EXEMPTION, CPP_YMPE - CPP_BASIC_EXEMPTION));
  const t2Base = Math.max(0, Math.min(s - CPP_YMPE, CPP_YAMPE - CPP_YMPE));
  return t1Base * CPP_RATE_T1 + t2Base * CPP_RATE_T2;
}

function calcCPPEmployer(gross: number) {
  const s = Math.max(0, gross);
  const t1Base = Math.max(0, Math.min(s - CPP_BASIC_EXEMPTION, CPP_YMPE - CPP_BASIC_EXEMPTION));
  const t2Base = Math.max(0, Math.min(s - CPP_YMPE, CPP_YAMPE - CPP_YMPE));
  return t1Base * CPP_RATE_T1 + t2Base * CPP_RATE_T2;
}

function calcPersonalTaxes_BC_2025(gross: number) {
  const federal = taxFromBrackets(gross, FED_BRACKETS_2025);
  const provincial = taxFromBrackets(gross, BC_BRACKETS_2025);
  return federal + provincial; // ignore credits/surtaxes
}

function netFromGross(gross: number) {
  const personalTaxes = calcPersonalTaxes_BC_2025(gross);
  const personalCPP = calcCPPEmployee(gross); // excluded from "taxes" bucket, but reduces net
  const net = gross - personalTaxes - personalCPP;
  return { net, personalTaxes, personalCPP };
}

// Binary search to solve for gross salary given a target net
function solveGrossForNet(personalCashNeeded: number, opts?: { tolerance?: number; maxIter?: number; initialHigh?: number }) {
  const tolerance = opts?.tolerance ?? 0.01;
  const maxIter = opts?.maxIter ?? 100;
  let low = Math.max(0, personalCashNeeded);
  let high = opts?.initialHigh ?? Math.max(500_000, personalCashNeeded * 2);

  for (let i = 0; i < 20; i++) {
    const { net } = netFromGross(high);
    if (net >= personalCashNeeded) break;
    high *= 2;
  }

  let lastMid = high;
  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (low + high) / 2;
    const { net, personalTaxes, personalCPP } = netFromGross(mid);
    if (Math.abs(net - personalCashNeeded) <= tolerance || Math.abs(mid - lastMid) <= tolerance) {
      return { grossSalary: mid, personalTaxes, personalCPP, achievedNet: net, iterations: iter };
    }
    if (net < personalCashNeeded) low = mid; else high = mid;
    lastMid = mid;
  }
  const { net, personalTaxes, personalCPP } = netFromGross(lastMid);
  return { grossSalary: lastMid, personalTaxes, personalCPP, achievedNet: net, iterations: maxIter };
}

// Core scenario computation (salary only)
export function computeSalaryScenario(params: {
  businessIncome: number; // user-entered corp revenue
  personalCashNeeded: number; // target net to individual
  corpTaxRatePct: number; // e.g., 11 (SBD) or 27
  otherExpenses?: number; // optional corp expenses
}) {
  const { businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses = 0 } = params;
  const corpRate = Math.max(0, corpTaxRatePct) / 100;

  // 1) Solve gross salary for target net
  const solved = solveGrossForNet(personalCashNeeded);
  const grossSalary = solved.grossSalary;
  const personalTaxes = solved.personalTaxes;
  const personalCPP = solved.personalCPP;

  // 2) Corporate side
  const employerCPP = calcCPPEmployer(grossSalary);
  const corpProfitBeforeTax = Math.max(0, businessIncome - grossSalary - employerCPP - (otherExpenses || 0));
  const corporateTaxes = corpProfitBeforeTax * corpRate;
  const corporateCash = corpProfitBeforeTax - corporateTaxes;

  // 3) Derived
  const personalCash = grossSalary - personalTaxes - personalCPP; // ≈ personalCashNeeded
  const totalTaxes = personalTaxes + corporateTaxes; // excludes CPP
  const totalCPP = personalCPP + employerCPP;
  const totalCash = personalCash + corporateCash;
  const totalTaxRate = businessIncome > 0 ? totalTaxes / businessIncome : 0;
  const rrspRoom = Math.min(grossSalary * RRSP_PCT, RRSP_MAX_2025);

  return {
    grossSalary,
    personalTaxes,
    personalCPP,
    employerCPP,
    corpProfitBeforeTax,
    corporateTaxes,
    corporateCash,
    personalCash,
    totalTaxes,
    totalCPP,
    totalCash,
    totalTaxRate,
    rrspRoom,
  };
}

// =========================
// UI COMPONENT
// =========================
export default function SalaryScenario() {
  const [businessIncome, setBusinessIncome] = useState<number>(200_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState<number>(100_000);
  const [corpTaxRatePct, setCorpTaxRatePct] = useState<number>(11);
  const [otherExpenses, setOtherExpenses] = useState<number>(0);

  const res = useMemo(
    () => computeSalaryScenario({ businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses }),
    [businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses]
  );

  const fmt = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 }) : "—";
  const pct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="text-xl font-bold">Incorporated with Salary — BC 2025</h1>
        <p className="text-slate-400 text-sm">CPP is shown separately (excluded from taxes). Supports retained earnings (keep cash in the corp).</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h2 className="font-semibold mb-3">Inputs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-slate-400 mb-1">Business Income (before salary/CPP/tax)</span>
                <input
                  type="number"
                  className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
                  value={businessIncome}
                  onChange={(e) => setBusinessIncome(parseFloat(e.target.value || "0"))}
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-400 mb-1">Personal Cash Needed (after tax & CPP)</span>
                <input
                  type="number"
                  className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
                  value={personalCashNeeded}
                  onChange={(e) => setPersonalCashNeeded(parseFloat(e.target.value || "0"))}
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-400 mb-1">Corporate Tax Rate (%)</span>
                <input
                  type="number"
                  className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
                  value={corpTaxRatePct}
                  onChange={(e) => setCorpTaxRatePct(parseFloat(e.target.value || "0"))}
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-400 mb-1">Other Corporate Expenses (optional)</span>
                <input
                  type="number"
                  className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
                  value={otherExpenses}
                  onChange={(e) => setOtherExpenses(parseFloat(e.target.value || "0"))}
                />
              </label>
            </div>
            <div className="mt-3 text-xs text-slate-400 border border-white/10 rounded-xl p-3 bg-slate-900/50">
              <strong>Notes:</strong> Uses 2025 Federal + BC brackets. Ignores credits/surtaxes. CPP Tier 1 & 2 included, split employer/employee. CPP is <em>excluded</em> from the taxes bucket here but reduces take‑home.
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h2 className="font-semibold mb-3">Results</h2>
            <div className="space-y-2">
              <Row label="Gross Salary needed" value={fmt(res.grossSalary)} big />
              <Row label="Personal taxes (income tax only)" value={fmt(res.personalTaxes)} muted />
              <Row label="Personal CPP (employee)" value={fmt(res.personalCPP)} muted />
              <Row label="Net to you" value={fmt(res.personalCash)} />
              <Row label="Employer CPP (corporate)" value={fmt(res.employerCPP)} />
              <Row label="Corporate profit (before corp tax)" value={fmt(res.corpProfitBeforeTax)} />
              <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
              <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />
              <Row label="Total taxes (excludes CPP)" value={fmt(res.totalTaxes)} muted />
              <Row label="Total CPP (employer + employee)" value={fmt(res.totalCPP)} muted />
              <Row label="Effective tax rate (ex‑CPP)" value={pct(res.totalTaxRate)} pill />
              <Row label="Total cash (personal + corporate)" value={fmt(res.totalCash)} pill />
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 mt-4">
          <h2 className="font-semibold mb-3">RRSP Room (derived)</h2>
          <Row label="RRSP Room (18% of gross, capped)" value={fmt(res.rrspRoom)} />
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, muted, pill, big }: { label: string; value: string; muted?: boolean; pill?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 last:border-b-0 py-2">
      <div className={"text-sm " + (muted ? "text-slate-400" : "")}>{label}</div>
      <div className={(pill ? "px-2 py-0.5 rounded-full bg-white/5 border border-white/10 " : "") + (big ? "text-lg font-extrabold " : "") + " tabular-nums font-mono"}>
        {value}
      </div>
    </div>
  );
}


// =========================
// DividendScenario.tsx (full engine + UI)
// Incorporated with Dividends — BC 2025
// - No CPP
// - Corporate tax on profit, then dividends paid from after‑tax profit
// - Personal dividend tax via gross‑up + credits on taxable amount
// - Supports eligible vs non‑eligible dividends
// - Can target a Personal Cash Needed (solver) but caps at available after‑tax profit
// =========================

import React, { useMemo, useState } from "react";

// ---- Dividend constants (2025) ----
const GROSS_UP = {
  eligible: 1.38,       // 38% gross‑up
  nonEligible: 1.15,    // 15% gross‑up
} as const;

// Federal dividend tax credits (percent of taxable/grossed‑up amount)
// CRA line 40425 (2025): eligible 15.0198%, other-than-eligible 9.0301%
const FED_DTC_RATE = {
  eligible: 0.150198,
  nonEligible: 0.090301,
} as const;

// BC dividend tax credits (percent of taxable/grossed‑up amount)
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

// ---- helpers ----
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

// Compute personal tax on a *cash* dividend given dividend type
function personalDividendTax(divCash: number, type: "eligible" | "nonEligible") {
  const grossed = Math.max(0, divCash) * GROSS_UP[type]; // taxable amount added to income
  const fedTax = progressiveTax(grossed, FED_BRACKETS_2025);
  const bcTax = progressiveTax(grossed, BC_BRACKETS_2025);
  const fedDTC = grossed * FED_DTC_RATE[type];
  const bcDTC = grossed * BC_DTC_RATE[type];
  // Tax cannot be negative after credits (keep it simple)
  const personalTax = Math.max(0, fedTax + bcTax - fedDTC - bcDTC);
  return { personalTax, fedTax, bcTax, fedDTC, bcDTC, taxableAmount: grossed };
}

// Solve for cash dividend needed to hit a target personal net
function solveDividendForNet(targetNet: number, type: "eligible" | "nonEligible") {
  if (targetNet <= 0) return { dividendCash: 0, tax: 0, achievedNet: 0, details: null as any };
  let low = targetNet;          // net <= divCash, so start here
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
      return { dividendCash: mid, tax: det.personalTax, achievedNet: net, details: det };
    }
    if (net < targetNet) low = mid; else high = mid;
    lastMid = mid;
  }
  const det = personalDividendTax(lastMid, type);
  return { dividendCash: lastMid, tax: det.personalTax, achievedNet: lastMid - det.personalTax, details: det };
}

export function calculateIncorporatedDividends(params: {
  businessIncome: number;      // corp revenue before tax
  personalCashNeeded: number;  // target net to person (may be capped by available after‑tax profit)
  corpTaxRatePct: number;      // e.g., 11 or 27
  otherExpenses?: number;      // optional corp expenses
  dividendType?: "eligible" | "nonEligible"; // default nonEligible
}) {
  const { businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses = 0, dividendType = "nonEligible" } = params;
  const corpRate = Math.max(0, corpTaxRatePct) / 100;

  // 1) Corporate profit and tax (no CPP in dividend scenario)
  const corpProfitBeforeTax = Math.max(0, businessIncome - (otherExpenses || 0));
  const corporateTaxes = corpProfitBeforeTax * corpRate;
  const afterTaxProfit = corpProfitBeforeTax - corporateTaxes; // max cash available for dividends

  // 2) Solve required dividend to meet target net
  const solved = solveDividendForNet(Math.max(0, personalCashNeeded), dividendType);
  const requiredDividend = solved.dividendCash;
  const requiredDividendTax = solved.tax;

  // 3) Cap by available after‑tax profits (retain the rest)
  const dividendPaid = Math.min(afterTaxProfit, requiredDividend);
  const divTaxDet = personalDividendTax(dividendPaid, dividendType);
  const personalTaxes = divTaxDet.personalTax; // tax on dividends after credits

  const personalCash = dividendPaid - personalTaxes; // net to person
  const corporateCash = afterTaxProfit - dividendPaid; // retained earnings

  // Totals/ratios (CPP = 0)
  const totalTaxes = personalTaxes + corporateTaxes;
  const totalCPP = 0;
  const totalCash = personalCash + corporateCash;
  const totalTaxRate = businessIncome > 0 ? totalTaxes / businessIncome : 0;

  return {
    scenario: "INC_DIVIDENDS" as const,

    grossSalary: 0,               // no salary
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

    federalTax: divTaxDet.fedTax,
    provincialTax: divTaxDet.bcTax,
    taxableIncome: divTaxDet.taxableAmount, // the grossed‑up amount

    // extras for UX/debug
    _requiredDividendToHitTarget: requiredDividend,
    _requiredDividendNet: solved.achievedNet,
    _cappedByAfterTaxProfit: requiredDividend > afterTaxProfit,
  };
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 }) : "—");
const pct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—");

export default function DividendScenario() {
  const [businessIncome, setBusinessIncome] = useState(200_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState(100_000);
  const [corpTaxRatePct, setCorpTaxRatePct] = useState(11);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [dividendType, setDividendType] = useState<"eligible" | "nonEligible">("nonEligible");

  const res = useMemo(
    () => calculateIncorporatedDividends({ businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses, dividendType }),
    [businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses, dividendType]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold mb-3">Incorporated — Dividends</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Business Income (before tax)</span>
          <input type="number" className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2" value={businessIncome} onChange={(e) => setBusinessIncome(parseFloat(e.target.value || "0"))} />
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Personal Cash Needed (target)</span>
          <input type="number" className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2" value={personalCashNeeded} onChange={(e) => setPersonalCashNeeded(parseFloat(e.target.value || "0"))} />
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Corporate Tax Rate (%)</span>
          <input type="number" className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2" value={corpTaxRatePct} onChange={(e) => setCorpTaxRatePct(parseFloat(e.target.value || "0"))} />
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Other Corporate Expenses</span>
          <input type="number" className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2" value={otherExpenses} onChange={(e) => setOtherExpenses(parseFloat(e.target.value || "0"))} />
        </label>
        <label className="text-sm col-span-full">
          <span className="block text-slate-400 mb-1">Dividend Type</span>
          <select className="w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2" value={dividendType} onChange={(e) => setDividendType(e.target.value as any)}>
            <option value="nonEligible">Non‑eligible (SBD income)</option>
            <option value="eligible">Eligible (general rate income)</option>
          </select>
        </label>
      </div>

      <div className="mt-3 text-xs text-slate-400 border border-white/10 rounded-xl p-3 bg-slate-900/50">
        <strong>Notes:</strong> 2025 dividend gross‑up (38%/15%) and credits (Fed 15.0198%/9.0301%; BC 12%/1.96%) applied to the taxable (grossed‑up) amount. AMT/credits beyond DTC are ignored for simplicity.
      </div>

      <div className="space-y-2 mt-4">
        <Row label="Dividend paid (cash)" value={fmt((res.eligibleDividends || 0) + (res.nonEligibleDividends || 0))} big />
        <Row label="Personal dividend taxes (after credits)" value={fmt(res.personalTaxes)} muted />
        <Row label="– Federal tax on grossed‑up" value={fmt(res.federalTax)} muted />
        <Row label="– Provincial tax on grossed‑up" value={fmt(res.provincialTax)} muted />
        <Row label="Net to you" value={fmt(res.personalCash)} />
        <Row label="Corporate profit (before corp tax)" value={fmt(res.totalCash + res.corporateTaxes)} />
        <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
        <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />
        <Row label="Total taxes (ex‑CPP)" value={fmt(res.totalTaxes)} muted />
        <Row label="Effective tax rate (ex‑CPP)" value={pct(res.totalTaxRate)} pill />
        <Row label="Taxable amount added (grossed‑up)" value={fmt(res.taxableIncome)} />
        {res._cappedByAfterTaxProfit && (
          <div className="text-amber-300 text-sm">Note: Available after‑tax corporate profit capped the dividend below what was needed to hit your target.</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted, pill, big }: { label: string; value: string; muted?: boolean; pill?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 last:border-b-0 py-2">
      <div className={"text-sm " + (muted ? "text-slate-400" : "")}>{label}</div>
      <div className={(pill ? "px-2 py-0.5 rounded-full bg-white/5 border border-white/10 " : "") + (big ? "text-lg font-extrabold " : "") + " tabular-nums font-mono"}>{value}</div>
    </div>
  );
}
