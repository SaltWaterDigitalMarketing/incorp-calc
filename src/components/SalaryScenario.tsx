import React, { useMemo, useState } from "react";

/**
 * SalaryScenario.tsx
 * Incorporated with Salary — BC 2025
 * - CPP excluded from taxes (but reduces net; shown separately)
 * - Supports retained earnings (BusinessIncome can exceed amounts needed to fund personal cash goal)
 * - 2025 Federal + BC tax brackets
 * - Applies Basic Personal Amount (BPA) credits (federal + BC)
 * - Binary search solver to back into Gross Salary for a target Personal Cash Needed
 *
 * Returns keys aligned with your ScenarioOutput from calculateUnincorporated:
 * {
 *   scenario, grossSalary, eligibleDividends, nonEligibleDividends,
 *   corporateTaxes, corporateCPP, personalTaxes, totalTaxes, totalCPP, personalCPP,
 *   corporateCash, personalCash, totalCash, totalTaxRate, rrspRoom,
 *   federalTax, provincialTax, taxableIncome
 * }
 */

// =========================
// 2025 CONSTANTS (Canada, BC)
// =========================
const CPP_BASIC_EXEMPTION = 3_500;
const CPP_YMPE = 68_500;  // Tier 1 ceiling
const CPP_YAMPE = 73_200; // Tier 2 ceiling

// Employee & Employer shares (symmetric in 2025)
const CPP_RATE_T1 = 0.0595; // 5.95% each up to YMPE (above basic exemption)
const CPP_RATE_T2 = 0.02;   // 2% each on band (YMPE..YAMPE)

// Federal brackets (2025)
const FED_BRACKETS_2025: Array<[number, number]> = [
  [55_867, 0.15],
  [111_733, 0.205],
  [173_205, 0.26],
  [246_752, 0.29],
  [Number.POSITIVE_INFINITY, 0.33],
];

// BC brackets (2025)
const BC_BRACKETS_2025: Array<[number, number]> = [
  [47_937, 0.0506],
  [95_875, 0.077],
  [110_076, 0.105],
  [133_664, 0.1229],
  [181_232, 0.147],
  [252_752, 0.168],
  [Number.POSITIVE_INFINITY, 0.205],
];

const RRSP_MAX_2025 = 32_490;
const RRSP_PCT = 0.18;

// ---- Basic Personal Amounts (2025) ----
const FED_BPA = 16_103;
const FED_BPA_RATE = 0.15;
const BC_BPA = 12_580;
const BC_BPA_RATE = 0.0506;

function applyBasicCredits(fedGross: number, bcGross: number) {
  const fedCredit = FED_BPA * FED_BPA_RATE;
  const bcCredit  = BC_BPA  * BC_BPA_RATE;
  return {
    fedNet: Math.max(0, fedGross - fedCredit),
    bcNet:  Math.max(0, bcGross  - bcCredit),
    fedCredit,
    bcCredit,
  };
}

// =========================
// HELPERS
// =========================
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

function calcCPPEmployee(gross: number): number {
  const s = Math.max(0, gross);
  const t1Base = Math.max(0, Math.min(s, CPP_YMPE) - CPP_BASIC_EXEMPTION);
  const t2Base = Math.max(0, Math.min(s, CPP_YAMPE) - CPP_YMPE);
  return t1Base * CPP_RATE_T1 + t2Base * CPP_RATE_T2;
}

function calcCPPEmployer(gross: number): number {
  // symmetric to employee in 2025
  return calcCPPEmployee(gross);
}

function calcFederalTax_2025(taxableIncome: number): number {
  return progressiveTax(taxableIncome, FED_BRACKETS_2025);
}

function calcProvincialTax_BC_2025(taxableIncome: number): number {
  return progressiveTax(taxableIncome, BC_BRACKETS_2025);
}

// Net-of-tax-and-CPP for a given gross salary
function netFromGross(grossSalary: number) {
  // In this simplified model, taxableIncome = grossSalary (CPP excluded from “taxes” bucket)
  const taxableIncome = Math.max(0, grossSalary);

  // Gross income tax (pre-credits)
  const fedGross = calcFederalTax_2025(taxableIncome);
  const bcGross  = calcProvincialTax_BC_2025(taxableIncome);

  // Apply Basic Personal Amount credits
  const { fedNet, bcNet } = applyBasicCredits(fedGross, bcGross);

  const personalTaxes = fedNet + bcNet;                // income tax NET of BPA
  const personalCPP   = calcCPPEmployee(grossSalary);  // reduces take-home, not counted as “tax”
  const net = grossSalary - personalTaxes - personalCPP;

  return {
    net,
    personalTaxes,
    personalCPP,
    federalTax: fedNet,          // expose NET values (after BPA)
    provincialTax: bcNet,        // expose NET values (after BPA)
    taxableIncome,
  };
}

// Solve gross salary for target net (binary search)
function solveGrossForNet(
  personalCashNeeded: number,
  opts?: { tolerance?: number; maxIter?: number; initialHigh?: number }
) {
  const tolerance = opts?.tolerance ?? 0.01; // $0.01
  const maxIter = opts?.maxIter ?? 100;
  let low = Math.max(0, personalCashNeeded);
  let high = opts?.initialHigh ?? Math.max(500_000, personalCashNeeded * 2);

  // Expand high until net(high) >= target
  for (let i = 0; i < 20; i++) {
    const { net } = netFromGross(high);
    if (net >= personalCashNeeded) break;
    high *= 2;
  }

  let lastMid = high;
  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (low + high) / 2;
    const { net, personalTaxes, personalCPP, federalTax, provincialTax, taxableIncome } = netFromGross(mid);

    if (Math.abs(net - personalCashNeeded) <= tolerance || Math.abs(mid - lastMid) <= tolerance) {
      return {
        grossSalary: mid,
        personalTaxes,
        personalCPP,
        federalTax,
        provincialTax,
        taxableIncome,
        achievedNet: net,
        iterations: iter,
      };
    }

    if (net < personalCashNeeded) low = mid;
    else high = mid;

    lastMid = mid;
  }

  const { net, personalTaxes, personalCPP, federalTax, provincialTax, taxableIncome } = netFromGross(lastMid);
  return {
    grossSalary: lastMid,
    personalTaxes,
    personalCPP,
    federalTax,
    provincialTax,
    taxableIncome,
    achievedNet: net,
    iterations: maxIter,
  };
}

// =========================
// Core scenario computation (returns ScenarioOutput-like shape)
// =========================
export function calculateIncorporatedSalary(params: {
  businessIncome: number;      // corp revenue before salary/CPP/tax
  personalCashNeeded: number;  // target net to individual
  corpTaxRatePct: number;      // e.g., 11 (SBD) or 27
  otherExpenses?: number;      // optional corp expenses
}) {
  const { businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses = 0 } = params;
  const corpRate = Math.max(0, corpTaxRatePct) / 100;

  // 1) Solve gross salary for target net
  const solved = solveGrossForNet(personalCashNeeded);
  const grossSalary = solved.grossSalary;
  const personalTaxes = solved.personalTaxes;
  const personalCPP = solved.personalCPP;
  const federalTax = solved.federalTax;
  const provincialTax = solved.provincialTax;
  const taxableIncome = solved.taxableIncome;

  // 2) Corporate side
  const corporateCPP = calcCPPEmployer(grossSalary); // employer share only
  const corpProfitBeforeTax = Math.max(0, businessIncome - grossSalary - corporateCPP - (otherExpenses || 0));
  const corporateTaxes = corpProfitBeforeTax * corpRate;
  const corporateCash = corpProfitBeforeTax - corporateTaxes;

  // 3) Derived
  const personalCash = grossSalary - personalTaxes - personalCPP; // ≈ personalCashNeeded
  const totalTaxes = personalTaxes + corporateTaxes;              // CPP excluded
  const totalCPP = personalCPP + corporateCPP;
  const totalCash = personalCash + corporateCash;
  const totalTaxRate = businessIncome > 0 ? totalTaxes / businessIncome : 0;
  const rrspRoom = Math.min(grossSalary * RRSP_PCT, RRSP_MAX_2025);

  return {
    scenario: "INC_SALARY" as const,

    grossSalary,
    eligibleDividends: 0,
    nonEligibleDividends: 0,

    corporateTaxes,
    corporateCPP,

    personalTaxes,
    totalTaxes,
    totalCPP,
    personalCPP,

    corporateCash,
    personalCash,
    totalCash,
    totalTaxRate,
    rrspRoom,

    federalTax,
    provincialTax,
    taxableIncome,
  };
}

// =========================
// UI COMPONENT
// =========================
const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 }) : "—";
const pct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—");

export default function SalaryScenario() {
  const [businessIncome, setBusinessIncome] = useState(200_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState(100_000);
  const [corpTaxRatePct, setCorpTaxRatePct] = useState(11);
  const [otherExpenses, setOtherExpenses] = useState(0);

  const res = useMemo(
    () => calculateIncorporatedSalary({ businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses }),
    [businessIncome, personalCashNeeded, corpTaxRatePct, otherExpenses]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold mb-3">Incorporated — Salary</h2>

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
        <strong>Notes:</strong> 2025 Fed + BC brackets. CPP Tier 1 & 2 included (EE/ER). CPP is <em>excluded</em> from “taxes”
        here but reduces take-home. <strong>Basic Personal Amount credits applied (federal + BC).</strong> Other credits/surtaxes ignored.
      </div>

      <div className="space-y-2 mt-4">
        <Row label="Gross Salary needed" value={fmt(res.grossSalary)} big />
        <Row label="Personal taxes (income tax only, net of BPA)" value={fmt(res.personalTaxes)} muted />
        <Row label="– Federal portion (net of BPA)" value={fmt(res.federalTax)} muted />
        <Row label="– Provincial portion (net of BPA)" value={fmt(res.provincialTax)} muted />
        <Row label="Personal CPP (employee)" value={fmt(res.personalCPP)} muted />
        <Row label="Net to you" value={fmt(res.personalCash)} />
        <Row label="Employer CPP (corporate)" value={fmt(res.corporateCPP)} />
        <Row label="Corporate profit (before corp tax)" value={fmt(res.totalCash + res.corporateTaxes)} />{/* equals corpCash + corpTax */}
        <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
        <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />
        <Row label="Total taxes (excludes CPP)" value={fmt(res.totalTaxes)} muted />
        <Row label="Total CPP (employer + employee)" value={fmt(res.totalCPP)} muted />
        <Row label="Effective tax rate (ex-CPP)" value={pct(res.totalTaxRate)} pill />
        <Row label="Total cash (personal + corporate)" value={fmt(res.totalCash)} pill />
        <Row label="RRSP Room (18% of gross, capped)" value={fmt(res.rrspRoom)} />
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
          "tabular-nums font-mono"
        }
      >
        {value}
      </div>
    </div>
  );
}
