import React, { useMemo, useState } from "react";
import { computeCorporateTaxesBC } from "../engine/corporateTax_BC";

/**
 * SalaryScenario.tsx
 * Incorporated with Salary — BC 2025 (CRA-correct CPP)
 *
 * - Applies CPP correctly:
 *   * PERSONAL: deduct EE T1 enhanced (1%) + EE CPP2 (4%) from taxable income; credit EE T1 base (4.95%) at lowest fed/prov rates
 *   * CORPORATE: deduct ER T1 base (4.95%) + ER T1 enhanced (1%) + ER CPP2 (4%) from corp taxable income
 * - CPP cash reduces net (shown separately). `totalTaxes` excludes CPP, but the displayed
 *   effective tax rate is INCLUSIVE of CPP (both employer + employee).
 * - Corporate tax is auto-calculated for BC CCPC (2025): 11% up to $500k SBD, 27% above.
 * - 2025 Fed + BC brackets, BPA credits (fed + BC)
 * - Binary search solver to back into Gross Salary for a target Personal Cash Needed
 */

// =========================
// 2025 CONSTANTS (Canada, BC)
// =========================

// CPP ceilings (2025)
const CPP_YMPE = 71_300;   // Tier 1 ceiling (2025)
const CPP_YAMPE = 81_200;  // Tier 2 ceiling (2025)

// CPP per-side rates (employee/employer)
const CPP_T1_BASE_RATE = 0.0495; // 4.95% base (non-refundable credit on EE side)
const CPP_T1_ENH_RATE  = 0.0100; // 1.00% first-additional (deductible)
const CPP_T2_RATE      = 0.0400; // 4.00% CPP2 (deductible)
const CPP_BASIC_EXEMPTION = 3_500;

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

/** Combine non-refundable credits and apply once (avoids order effects). */
function applyCredits(grossTax: number, credits: number) {
  return Math.max(0, grossTax - Math.max(0, credits));
}

/** Split CPP bases for a given gross salary */
function splitCPPBases(gross: number) {
  const s = Math.max(0, gross);
  const t1Base = Math.max(0, Math.min(s, CPP_YMPE) - CPP_BASIC_EXEMPTION);
  const t2Base = Math.max(0, Math.min(s, CPP_YAMPE) - CPP_YMPE);
  return { t1Base, t2Base };
}

/** Compute CPP parts (employee & employer), and CRA tax-treatment buckets */
function cppForEmployeeSalary(gross: number) {
  const { t1Base, t2Base } = splitCPPBases(gross);

  // Employee contributions (cash)
  const ee_t1_base = t1Base * CPP_T1_BASE_RATE; // creditable (base)
  const ee_t1_enh  = t1Base * CPP_T1_ENH_RATE;  // deductible
  const ee_t2      = t2Base * CPP_T2_RATE;      // deductible
  const ee_total   = ee_t1_base + ee_t1_enh + ee_t2;

  // Employer contributions (cash)
  const er_t1_base = t1Base * CPP_T1_BASE_RATE; // deductible corp
  const er_t1_enh  = t1Base * CPP_T1_ENH_RATE;  // deductible corp
  const er_t2      = t2Base * CPP_T2_RATE;      // deductible corp
  const er_total   = er_t1_base + er_t1_enh + er_t2;

  // CRA tax treatment
  const personalDeduction = ee_t1_enh + ee_t2; // reduces personal taxable income
  const corporateDeduction = er_t1_base + er_t1_enh + er_t2; // reduces corp taxable income
  const fedCreditAmount = ee_t1_base * FED_BPA_RATE; // 15% credit on EE base
  const bcCreditAmount  = ee_t1_base * BC_BPA_RATE;  // 5.06% credit on EE base

  return {
    // cash
    employeePaid: ee_total,
    employerPaid: er_total,
    // deductions & credits
    personalDeduction,
    corporateDeduction,
    extraFedCredit: fedCreditAmount,
    extraBcCredit: bcCreditAmount,
    // parts if needed
    parts: { ee_t1_base, ee_t1_enh, ee_t2, er_t1_base, er_t1_enh, er_t2, t1Base, t2Base },
  };
}

/** Net-of-tax-and-CPP for a given gross salary (with CRA-correct CPP handling) */
function netFromGross(grossSalary: number) {
  // CPP buckets/credits
  const cpp = cppForEmployeeSalary(grossSalary);

  // Personal taxable income is reduced by deductible CPP pieces (EE enhanced + EE CPP2)
  const taxableIncome = Math.max(0, grossSalary - cpp.personalDeduction);

  // Gross income tax (before credits)
  const fedGross = progressiveTax(taxableIncome, FED_BRACKETS_2025);
  const bcGross  = progressiveTax(taxableIncome, BC_BRACKETS_2025);

  // Non-refundable credits: BPA + CPP base EE credit
  const fedCredits = FED_BPA * FED_BPA_RATE + cpp.extraFedCredit;
  const bcCredits  = BC_BPA  * BC_BPA_RATE  + cpp.extraBcCredit;

  const fedNet = applyCredits(fedGross, fedCredits);
  const bcNet  = applyCredits(bcGross,  bcCredits);

  const personalTaxes = fedNet + bcNet;                 // income tax (ex-CPP)
  const personalCPP   = cpp.employeePaid;               // EE CPP cash reduces take-home
  const net = grossSalary - personalTaxes - personalCPP;

  return {
    net,
    personalTaxes,
    personalCPP,
    federalTax: fedNet,          // expose NET (after BPA + CPP credit)
    provincialTax: bcNet,        // expose NET (after BPA + CPP credit)
    taxableIncome,
    cpp,                         // return cpp buckets for corp side
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
    const solved = netFromGross(mid);

    if (Math.abs(solved.net - personalCashNeeded) <= tolerance || Math.abs(mid - lastMid) <= tolerance) {
      return { grossSalary: mid, ...solved, iterations: iter };
    }

    if (solved.net < personalCashNeeded) low = mid;
    else high = mid;

    lastMid = mid;
  }

  const solved = netFromGross(lastMid);
  return { grossSalary: lastMid, ...solved, iterations: maxIter };
}

// =========================
// Core scenario computation (returns ScenarioOutput-like shape)
// =========================
export function calculateIncorporatedSalary(params: {
  businessIncome: number;      // corp revenue before salary/CPP/tax
  personalCashNeeded: number;  // target net to individual
  otherExpenses?: number;      // optional corp expenses
}) {
  const { businessIncome, personalCashNeeded, otherExpenses = 0 } = params;

  // 1) Solve gross salary for target net
  const solved = solveGrossForNet(personalCashNeeded);
  const grossSalary    = solved.grossSalary;
  const personalTaxes  = solved.personalTaxes;
  const personalCPP    = solved.personalCPP;
  const federalTax     = solved.federalTax;
  const provincialTax  = solved.provincialTax;
  const taxableIncome  = solved.taxableIncome;

  // 2) Corporate side (employer CPP is deductible + cash outflow)
  const corporateCPP = solved.cpp?.employerPaid ?? 0;

  const corpProfitBeforeTax =
    Math.max(0, businessIncome - grossSalary - corporateCPP - (otherExpenses || 0));

  // Auto-calc BC + Federal corporate taxes (2025 CCPC)
  const { corporateTaxes } = computeCorporateTaxesBC(corpProfitBeforeTax);
  const corporateCash  = corpProfitBeforeTax - corporateTaxes;

  // 3) Derived
  const personalCash  = grossSalary - personalTaxes - personalCPP; // ≈ personalCashNeeded
  const totalTaxes    = personalTaxes + corporateTaxes;            // (excludes CPP)
  const totalCPP      = personalCPP + corporateCPP;
  const totalCash     = personalCash + corporateCash;

  // Effective tax rate INCLUDES CPP (EE+ER)
  const totalTaxRate  = businessIncome > 0
    ? (totalTaxes + totalCPP) / businessIncome
    : 0;

  const rrspRoom      = Math.min(grossSalary * RRSP_PCT, RRSP_MAX_2025);

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
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 })
    : "—";
const pct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—");

export default function SalaryScenario() {
  const [businessIncome, setBusinessIncome] = useState(200_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState(100_000);
  const [otherExpenses, setOtherExpenses] = useState(0);

  const res = useMemo(
    () => calculateIncorporatedSalary({ businessIncome, personalCashNeeded, otherExpenses }),
    [businessIncome, personalCashNeeded, otherExpenses]
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
        <strong>Notes:</strong> 2025 Fed + BC brackets. CPP Tier 1 & 2 handled per CRA:
        EE base credited at lowest rates; EE enhanced + CPP2 deducted from personal income;
        ER base/enhanced/CPP2 deducted corporately. Corporate tax auto-calculated for a BC CCPC
        (11% up to $500k SBD, 27% above). <strong>Effective tax rate shown includes CPP (EE+ER).</strong>
        BPA credits applied (federal + BC). Other credits/surtaxes ignored.
      </div>

      <div className="space-y-2 mt-4">
        <Row label="Gross Salary needed" value={fmt(res.grossSalary)} big />
        <Row label="Personal taxes (income tax only, net of credits)" value={fmt(res.personalTaxes)} muted />
        <Row label="– Federal portion (net of credits)" value={fmt(res.federalTax)} muted />
        <Row label="– Provincial portion (net of credits)" value={fmt(res.provincialTax)} muted />
        <Row label="Personal CPP (employee)" value={fmt(res.personalCPP)} muted />
        <Row label="Net to you" value={fmt(res.personalCash)} />
        <Row label="Employer CPP (corporate)" value={fmt(res.corporateCPP)} />
        <Row label="Corporate profit (before corp tax)" value={fmt(res.totalCash + res.corporateTaxes)} />
        <Row label="Corporate taxes" value={fmt(res.corporateTaxes)} />
        <Row label="Corporate cash (retained)" value={fmt(res.corporateCash)} />
        <Row label="Total taxes (incl. CPP)" value={fmt(res.totalTaxes + res.totalCPP)} muted />
        <Row label="Effective tax rate (incl. CPP)" value={pct(res.totalTaxRate)} pill />
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
          " tabular-nums font-mono"
        }
      >
        {value}
      </div>
    </div>
  );
}
