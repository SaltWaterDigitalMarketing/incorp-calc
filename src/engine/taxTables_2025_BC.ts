// CPP (2025 per your spec)
export const CPP = {
  BASIC_EXEMPT: 3_500,

  // 2025 ceilings
  YMPE: 71_300,     // Tier 1 ceiling
  YAMPE: 76_400,    // Tier 2 ceiling

  // Derived (Tier 1 pensionable base)
  MPE: 71_300 - 3_500, // = 67,800

  // 2025 rates:
  // NOTE: For unincorporated (self-employed) we need total (EE + ER).
  // Tier 1 total = 5.95% + 5.95% = 11.90%
  // Tier 2 total = 4.00% + 4.00% = 8.00%
  RATE_T1: 0.119,  // 11.90% (combined)
  RATE_T2: 0.08,   // 8.00% (combined)
} as const;

// Federal brackets (taxable income)
export const FED_BRACKETS: Array<[number, number]> = [
  [55_867, 0.15],
  [111_733, 0.205],
  [173_205, 0.26],
  [246_752, 0.29],
  [Number.POSITIVE_INFINITY, 0.33],
];

// BC brackets (taxable income)
export const BC_BRACKETS: Array<[number, number]> = [
  [47_937, 0.0506],
  [95_875, 0.0770],
  [110_076, 0.1050],
  [133_664, 0.1229],
  [181_232, 0.1470],
  [252_752, 0.1680],
  [Number.POSITIVE_INFINITY, 0.2050],
];

export const RRSP = { RATE: 0.18, MAX_2025: 32_490 } as const;
