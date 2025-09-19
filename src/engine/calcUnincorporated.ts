import { BC_BRACKETS, FED_BRACKETS, RRSP } from "./taxTables_2025_BC";
import { cppTaxTreatmentForUnincorporated } from "./cppHelpers";
import type { CalcInput, ScenarioOutput } from "./types";

/** ---------- BPA constants (2025) ---------- */
const FED_BPA = 16_103;
const FED_BPA_RATE = 0.15;     // credit @ lowest federal rate
const BC_BPA  = 12_580;
const BC_BPA_RATE = 0.0506;    // credit @ lowest BC rate

function applyBasicCredits(
  fedGross: number,
  bcGross: number,
  extraFedCredit = 0,
  extraBcCredit = 0
) {
  const fedCredit = FED_BPA * FED_BPA_RATE + extraFedCredit;
  const bcCredit  = BC_BPA  * BC_BPA_RATE + extraBcCredit;
  return {
    fedNet: Math.max(0, fedGross - fedCredit),
    bcNet:  Math.max(0, bcGross  - bcCredit),
    fedCredit,
    bcCredit,
  };
}

/** ---------- helpers ---------- */
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

/** ---------- main ---------- */
export function calculateUnincorporated(input: CalcInput): ScenarioOutput {
  const grossSalary = input.businessIncome; // using businessIncome as personal gross here

  // === CPP with CRA treatment (self-employed pays both sides) ===
  const cpp = cppTaxTreatmentForUnincorporated(grossSalary);

  // Personal taxable income is reduced by CPP deductible pieces (enhanced + employer-equivalent)
  const taxableIncome = Math.max(0, grossSalary - cpp.personalDeduction);

  // Gross (pre-credit) taxes on reduced taxable income
  const federalTaxGross    = progressiveTax(taxableIncome, FED_BRACKETS);
  const provincialTaxGross = progressiveTax(taxableIncome, BC_BRACKETS);

  // CPP base employee amount gives non-refundable credits at lowest rates
  const extraFedCredit = cpp.credits.baseEE * FED_BPA_RATE;   // 15%
  const extraBcCredit  = cpp.credits.baseEE * BC_BPA_RATE;    // 5.06%

  // Apply BPA + CPP credits
  const { fedNet, bcNet } = applyBasicCredits(
    federalTaxGross,
    provincialTaxGross,
    extraFedCredit,
    extraBcCredit
  );

  // Net taxes after credits (CPP cash kept separate)
  const federalTax    = fedNet;
  const provincialTax = bcNet;
  const personalTaxes = federalTax + provincialTax;

  // CPP cash outflow is entirely personal for unincorporated
  const totalCPP     = cpp.personalPaid;
  const personalCPP  = totalCPP;
  const corporateCPP = 0;

  // Corporate side (none for unincorporated)
  const corporateTaxes = 0;
  const corporateCash  = 0;

  // Cash flows
  const personalCash = grossSalary - personalTaxes - personalCPP;
  const totalCash    = personalCash;

  // Totals/ratios (CPP excluded from totalTaxes by your convention)
  const totalTaxes   = personalTaxes + corporateTaxes;
  const totalTaxRate = grossSalary > 0 ? totalTaxes / grossSalary : 0;

  // RRSP room (earned income × 18%, capped) — unchanged
  const rrspRoom     = Math.min(RRSP.MAX_2025, grossSalary * RRSP.RATE);

  return {
    scenario: "UNINCORPORATED",

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

    // Expose NET (after credits) components for transparency
    federalTax,
    provincialTax,
    taxableIncome,
  };
}
