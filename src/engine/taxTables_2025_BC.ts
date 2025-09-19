// =========================
// CPP (2025 per CRA)
// =========================
export const CPP = {
  BASIC_EXEMPT: 3_500,

  // 2025 ceilings
  YMPE: 71_300,   // Tier 1 ceiling
  YAMPE: 81_200,  // Tier 2 ceiling (CPP2 band upper)

  // Per-side rates (employee & employer)
  EE_T1_BASE_RATE: 0.0495, // 4.95% employee base (creditable)
  ER_T1_BASE_RATE: 0.0495, // 4.95% employer base (deductible)
  EE_T1_ENH_RATE:  0.0100, // 1.00% employee first-additional (deductible)
  ER_T1_ENH_RATE:  0.0100, // 1.00% employer first-additional (deductible)
  EE_T2_RATE: 0.0400,      // 4.00% employee CPP2 (deductible)
  ER_T2_RATE: 0.0400,      // 4.00% employer CPP2 (deductible),
} as const;

// =========================
// Federal tax brackets (2025)
// =========================
export const FED_BRACKETS: Array<[number, number]> = [
  [55_867, 0.15],
  [111_733, 0.205],
  [173_205, 0.26],
  [246_752, 0.29],
  [Number.POSITIVE_INFINITY, 0.33],
];

// =========================
// BC tax brackets (2025)
// =========================
export const BC_BRACKETS: Array<[number, number]> = [
  [47_937, 0.0506],
  [95_875, 0.0770],
  [110_076, 0.1050],
  [133_664, 0.1229],
  [181_232, 0.1470],
  [252_752, 0.1680],
  [Number.POSITIVE_INFINITY, 0.2050],
];

// =========================
// RRSP (2025)
// =========================
export const RRSP = {
  RATE: 0.18,
  MAX_2025: 32_490,
} as const;
