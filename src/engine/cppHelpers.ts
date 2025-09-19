// src/engine/cppHelpers.ts

/**
 * CPP helpers (2025) with CRA-correct tax treatment for
 * - Self-employed (unincorporated): you pay both sides.
 *   * Non-refundable credit = employee base portion only (4.95% of T1 base)
 *   * Deduction from income = employer base (4.95%) + ALL enhanced (T1 1%+1%) + ALL CPP2 (T2 4%+4%)
 *
 * Notes:
 * - Tier 1 base applies from (gross - BASIC_EXEMPTION) up to YMPE.
 * - Tier 2 (CPP2) applies from YMPE to YAMPE.
 */

export const CPP_2025 = {
  BASIC_EXEMPTION: 3_500,

  // 2025 ceilings
  YMPE: 71_300,   // Tier 1 ceiling
  YAMPE: 81_200,  // Tier 2 ceiling

  // Per-side rates (employee or employer)
  T1_BASE_RATE: 0.0495, // 4.95% (base)
  T1_ENH_RATE:  0.0100, // 1.00% (enhanced)
  T2_RATE:      0.0400, // 4.00% (CPP2)
} as const;

function splitCPPBases(gross: number) {
  const s = Math.max(0, gross);
  const t1Base = Math.max(0, Math.min(s, CPP_2025.YMPE) - CPP_2025.BASIC_EXEMPTION);
  const t2Base = Math.max(0, Math.min(s, CPP_2025.YAMPE) - CPP_2025.YMPE);
  return { t1Base, t2Base };
}

export type SelfEmployedCPPResult = {
  /** Total cash CPP paid by the individual (both sides, SE) */
  personalPaid: number;

  /** Amounts that become non-refundable credits (employee base only) */
  credits: {
    baseEE: number; // 4.95% * T1 base
  };

  /** Amount that is deductible from personal income */
  personalDeduction: number;

  /** Detailed parts for transparency/debug */
  parts: {
    t1Base: number;
    t2Base: number;
    // Employee-equivalent portions
    ee_t1_base: number;
    ee_t1_enh: number;
    ee_t2: number;
    // Employer-equivalent portions
    er_t1_base: number;
    er_t1_enh: number;
    er_t2: number;
  };
};

/**
 * Self-employed (unincorporated) CPP breakdown with CRA tax treatment.
 */
export function cppTaxTreatmentForUnincorporated(gross: number): SelfEmployedCPPResult {
  const { t1Base, t2Base } = splitCPPBases(gross);

  // Employee-equivalent portions
  const ee_t1_base = t1Base * CPP_2025.T1_BASE_RATE; // credit (non-refundable)
  const ee_t1_enh  = t1Base * CPP_2025.T1_ENH_RATE;  // deductible
  const ee_t2      = t2Base * CPP_2025.T2_RATE;      // deductible

  // Employer-equivalent portions
  const er_t1_base = t1Base * CPP_2025.T1_BASE_RATE; // deductible
  const er_t1_enh  = t1Base * CPP_2025.T1_ENH_RATE;  // deductible
  const er_t2      = t2Base * CPP_2025.T2_RATE;      // deductible

  // Total cash paid by self-employed (you pay both sides)
  const personalPaid =
    ee_t1_base + ee_t1_enh + ee_t2 +
    er_t1_base + er_t1_enh + er_t2;

  // CRA treatment:
  // - Non-refundable credit: employee base only
  const credits = { baseEE: ee_t1_base };

  // - Deduction from income: employer base + all enhanced + all CPP2
  const personalDeduction =
    er_t1_base + ee_t1_enh + er_t1_enh + ee_t2 + er_t2;

  return {
    personalPaid,
    credits,
    personalDeduction,
    parts: {
      t1Base, t2Base,
      ee_t1_base, ee_t1_enh, ee_t2,
      er_t1_base, er_t1_enh, er_t2,
    },
  };
}
