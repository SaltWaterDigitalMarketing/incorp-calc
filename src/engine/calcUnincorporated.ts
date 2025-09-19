import { BC_BRACKETS, FED_BRACKETS, CPP, RRSP } from "./taxTables_2025_BC";
import type { CalcInput, ScenarioOutput } from "./types";

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

function calcCPP(gross: number): number {
  // Tier 1
  const base1 = Math.min(Math.max(gross, 0), CPP.YMPE) - CPP.BASIC_EXEMPT;
  const cpp1 = Math.max(0, Math.min(base1, CPP.MPE)) * CPP.RATE_T1;
  // Tier 2 (over YMPE up to YAMPE)
  const base2 = Math.max(0, Math.min(gross, CPP.YAMPE) - CPP.YMPE);
  const cpp2 = base2 * CPP.RATE_T2;
  return cpp1 + cpp2;
}

export function calculateUnincorporated(input: CalcInput): ScenarioOutput {
  const grossSalary = input.businessIncome; // keeping your current input usage

  // In unincorporated, there is no employer portion: keep CPP separate from taxes
  const totalCPP = calcCPP(grossSalary);
  const corporateCPP = 0;               // FIX: no corporate CPP
  const personalCPP  = totalCPP;        // FIX: all CPP borne personally

  // Keep CPP out of taxable income in this simplified model
  const taxableIncome = Math.max(0, grossSalary);  // FIX: don't subtract corporateCPP
  const federalTax    = progressiveTax(taxableIncome, FED_BRACKETS);
  const provincialTax = progressiveTax(taxableIncome, BC_BRACKETS);
  const personalTaxes = federalTax + provincialTax;

  const corporateTaxes = 0;
  const totalTaxes     = personalTaxes + corporateTaxes;

  const corporateCash  = 0;
  const personalCash   = grossSalary - personalTaxes - personalCPP;
  const totalCash      = personalCash;

  const totalTaxRate   = grossSalary > 0 ? totalTaxes / grossSalary : 0;
  const rrspRoom       = Math.min(RRSP.MAX_2025, grossSalary * RRSP.RATE);

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

    federalTax,
    provincialTax,
    taxableIncome,
  };
}
