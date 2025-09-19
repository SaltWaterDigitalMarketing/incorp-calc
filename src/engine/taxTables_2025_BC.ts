// src/engine/taxTables_2025_BC.ts

/**
 * 2025 Tax Tables — BC / Canada
 * - CPP updated for 2025 with correct YAMPE = 81,200
 * - Keeps legacy keys (RATE_T1, RATE_T2, MPE) so older code won’t break
 * - Exposes per-side CPP rates for CRA-correct handling (employee/employer & self-employed)
 */

// ===== CPP (2025) =====
export const CPP = {
  BASIC_EXEMPTION: 3_500,

  // Ceilings
  YMPE: 71_300,   // Tier 1 ceiling (2025)
  YAMPE: 81_200,  // Tier 2 ceiling (2025) ← updated

  // Derived (legacy compat)
  MPE: 71_300 - 3_500, // = 67,800 (max pensionable earnings for Tier 1)

  /**
   * Combined rates (employee + employer) — useful for legacy/self-employed calcs
   * - Tier 1 total: 5.95% + 5.95% = 11.90%  (4.95% base + 1.00% enhanced per side)
   * - Tier 2 total: 4.00% + 4.00% = 8.00%
   */
  RATE_T1: 0.119, // 11.90% combined
  RATE_T2: 0.08,  // 8.00% combined

  /**
   * CRA-correct per-side rates for new logic
   * - T1 base (4.95%) is creditable (EE) / deductible (ER)
   * - T1 enhanced (1.00%) is deductible
   * - T2 CPP2 (4.00%) is deductible
   */
  RATES: {
    EMPLOYEE: {
      T1_BASE: 0.0495, // 4.95%
      T1_ENH:  0.0100, // 1.00%
      T2:      0.0400, // 4.00%
    },
    EMPLOYER: {
      T1_BASE: 0.0495, // 4.95%
      T1_ENH:  0.0100, // 1.00%
      T2:      0.0400, // 4.00%
    },
    SELF_EMP_TOTAL: {
      // (employee + employer)
      T1_BASE: 0.0990, // 9.90% (4.95 + 4.95)
      T1_ENH:  0.0200, // 2.00% (1.00 + 1.00)
      T2:      0.0800, // 8.00% (4.00 + 4.00)
    },
  },
} as const;

// ===== Federal brackets (2025) =====
export const FED_BRACKETS: Array<[number, number]> = [
  [55_867, 0.15],
  [111_733, 0.205],
  [173_205, 0.26],
  [246_752, 0.29],
  [Number.POSITIVE_INFINITY, 0.33],
];

// ===== BC brackets (2025) =====
export const BC_BRACKETS: Array<[number, number]> = [
  [47_937, 0.0506],
  [95_875, 0.0770],
  [110_076, 0.1050],
  [133_664, 0.1229],
  [181_232, 0.1470],
  [252_752, 0.1680],
  [Number.POSITIVE_INFINITY, 0.2050],
];

// ===== RRSP room (2025) =====
export const RRSP = {
  RATE: 0.18,          // 18% of earned income
  MAX_2025: 32_490,    // 2025 dollar cap
} as const;

/**
 * (Optional) Dividend constants (2025) — if you want a single source of truth
 * Move/use as needed. Your components currently hardcode these locally.
 */
export const DIVIDENDS_2025 = {
  GROSS_UP: {
    eligible: 1.38,
    nonEligible: 1.15,
  },
  FED_DTC_RATE: {
    eligible: 0.150198,   // 15.0198% of grossed-up
    nonEligible: 0.090301, // 9.0301% of grossed-up
  },
  BC_DTC_RATE: {
    eligible: 0.12,       // 12.00% of grossed-up
    nonEligible: 0.0196,  // 1.96% of grossed-up
  },
} as const;

/**
 * (Optional) Corporate tax constants for BC CCPC (2025).
 * You’re already using computeCorporateTaxesBC, but these are here for reference.
 */
export const CORP_BC_2025 = {
  SBD_LIMIT: 500_000,
  COMBINED_RATES: {
    sbd: 0.11, // 11% (Fed 9% + BC 2%)
    gen: 0.27, // 27% (Fed 15% + BC 12%)
  },
} as const;
