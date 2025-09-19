import { BC_BRACKETS, FED_BRACKETS, CPP, RRSP } from "./taxTables_2025_BC";
import type { CalcInput, ScenarioOutput } from "./types";

/** ---------- BPA constants (2025) ---------- */
const FED_BPA = 16_103;
const FED_BPA_RATE = 0.15;     // credit @ lowest federal rate
const BC_BPA  = 12_580;
const BC_BPA_RATE = 0.0506;    // credit @ lowest BC rate

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

function calcCPP(gross: number): number {
  // Tier 1
  const base1 = Math.min(Math.max(gross, 0), CPP.YMPE) - CPP.BASIC_EXEMPT;
  const cpp1  = Math.max(0, Math.min(base1, CPP.MPE)) * CPP.RATE_T1;
  // Tier 2 (over YMPE up to YAMPE)
  const base2 = Math.max(0, Math.min(gross, CPP.YAMPE) - CPP.YMPE);
  const cpp2  = base2 * CPP.RATE_T2;
  return cpp1 + cpp2;
}

/** ---------- main ---------- */
export function calculateUnincorporated(input: CalcInput): ScenarioOutput {
  const grossSalary = input.businessIncome; // unchanged: using businessIncome as the personal gross here

  // CPP kept separate from "taxes" in this model
  const totalCPP    = calcCPP(grossSalary);
  const corporateCPP = 0;            // uninc: no employer CPP
  const personalCPP  = totalCPP;     // all CPP borne personally

  // Income tax base (CPP excluded in this simplified model)
  const taxableIncome = Math.max(0, grossSalary);

  // Gross (pre-credit) taxes
  const federalTaxGross    = progressiveTax(taxableIncome, FED_BRACKETS);
  const provincialTaxGross = progressiveTax(taxableIncome, BC_BRACKETS);

  // Apply BPA credits (federal + BC)
  const { fedNet, bcNet } = applyBasicCredits(federalTaxGross, provincialTaxGross);

  // Net taxes after BPA
  const federalTax    = fedNet;
  const provincialTax = bcNet;
  const personalTaxes = federalTax + provincialTax;   // still excludes CPP

  // Corporate side (none for unincorporated)
  const corporateTaxes = 0;
  const corporateCash  = 0;

  // Cash flows
  const personalCash = grossSalary - personalTaxes - personalCPP;
  const totalCash    = personalCash;

  // Totals/ratios
  const totalTaxes   = personalTaxes + corporateTaxes; // CPP excluded
  const totalTaxRate = grossSalary > 0 ? totalTaxes / grossSalary : 0;
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

    // Expose NET (after BPA) components for transparency
    federalTax,
    provincialTax,
    taxableIncome,
  };
}
