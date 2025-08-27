// CPP (2025 per your spec)
export const CPP = {
  YMPE: 68_500,
  BASIC_EXEMPT: 3_500,
  MPE: 65_000,           // YMPE - BASIC_EXEMPT
  YAMPE: 73_200,         // upper bound for CPP2
  RATE_T1: 0.119,        // 11.90% total (self-employed)
  RATE_T2: 0.04          // 4% total (self-employed)
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
