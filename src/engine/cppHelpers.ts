import { CPP } from "./taxTables_2025_BC";

/**
 * Split the gross salary into CPP Tier 1 and Tier 2 bases.
 */
export function splitCPPBases(gross: number) {
  const safeGross = Math.max(0, gross);

  const t1Base = Math.max(0, Math.min(safeGross, CPP.YMPE) - CPP.BASIC_EXEMPT);
  const t2Base = Math.max(0, Math.min(safeGross, CPP.YAMPE) - CPP.YMPE);

  return { t1Base, t2Base };
}

/**
 * Break down CPP contributions into employee/employer parts
 * and return totals.
 */
export function calcCPPParts(gross: number) {
  const { t1Base, t2Base } = splitCPPBases(gross);

  // Employee
  const ee_t1_base = t1Base * CPP.EE_T1_BASE_RATE;
  const ee_t1_enh  = t1Base * CPP.EE_T1_ENH_RATE;
  const ee_t2      = t2Base * CPP.EE_T2_RATE;

  // Employer
  const er_t1_base = t1Base * CPP.ER_T1_BASE_RATE;
  const er_t1_enh  = t1Base * CPP.ER_T1_ENH_RATE;
  const er_t2      = t2Base * CPP.ER_T2_RATE;

  const totals = {
    employee: ee_t1_base + ee_t1_enh + ee_t2,
    employer: er_t1_base + er_t1_enh + er_t2,
    total: ee_t1_base + ee_t1_enh + ee_t2 + er_t1_base + er_t1_enh + er_t2,
  };

  return {
    t1Base,
    t2Base,
    ee_t1_base,
    ee_t1_enh,
    ee_t2,
    er_t1_base,
    er_t1_enh,
    er_t2,
    totals,
  };
}

/**
 * Tax treatment for self-employed / unincorporated income.
 * - Personal pays both EE + ER.
 * - Employee base portion (4.95%) gets non-refundable tax credit.
 * - All other CPP (EE enhanced + EE CPP2 + ER base + ER enhanced + ER CPP2) deductible.
 */
export function cppTaxTreatmentForUnincorporated(gross: number) {
  const p = calcCPPParts(gross);
  const creditBase = p.ee_t1_base; // creditable portion
  const deductible =
    p.er_t1_base + p.ee_t1_enh + p.er_t1_enh + p.ee_t2 + p.er_t2;

  return {
    credits: { baseEE: creditBase },
    personalDeduction: deductible,
    corporateDeduction: 0,
    personalPaid: p.totals.total,
    corporatePaid: 0,
    parts: p,
  };
}

/**
 * Tax treatment for Incorporated with Salary.
 * - Employee pays their side.
 * - Employer pays their side.
 * - Employee base portion (4.95%) gets non-refundable credit.
 * - Employee enhanced + CPP2 deductible personally.
 * - Employer base + enhanced + CPP2 deductible corporately.
 */
export function cppTaxTreatmentForEmployeeSalary(gross: number) {
  const p = calcCPPParts(gross);

  const creditBase = p.ee_t1_base;
  const persDeduct = p.ee_t1_enh + p.ee_t2;
  const corpDeduct = p.er_t1_base + p.er_t1_enh + p.er_t2;

  return {
    credits: { baseEE: creditBase },
    personalDeduction: persDeduct,
    corporateDeduction: corpDeduct,
    personalPaid: p.totals.employee,
    corporatePaid: p.totals.employer,
    parts: p,
  };
}

/**
 * Tax treatment for Dividend-only income.
 * - No CPP contributions, credits, or deductions apply.
 */
export function cppTaxTreatmentForDividendOnly() {
  return {
    credits: { baseEE: 0 },
    personalDeduction: 0,
    corporateDeduction: 0,
    personalPaid: 0,
    corporatePaid: 0,
    parts: null as any,
  };
}
