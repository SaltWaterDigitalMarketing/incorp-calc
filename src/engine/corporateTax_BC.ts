// src/engine/corporateTax_BC.ts

export const SBD_LIMIT_BC = 500_000;

/** 2025 combined CCPC rates (Federal + BC) */
export const RATES_2025 = {
  sbd_combined: 0.11, // 11% (Fed 9% + BC 2%)
  gen_combined: 0.27, // 27% (Fed 15% + BC 12%)
};

export type CorpTaxResult = {
  profitBeforeTax: number;
  sbdPortion: number;
  genPortion: number;
  taxOnSBD: number;
  taxOnGen: number;
  corporateTaxes: number;
  effectiveRate: number;
};

export function computeCorporateTaxesBC(profitBeforeTax: number): CorpTaxResult {
  const p = Math.max(0, profitBeforeTax);
  const sbdPortion = Math.min(p, SBD_LIMIT_BC);
  const genPortion = Math.max(0, p - SBD_LIMIT_BC);

  const taxOnSBD = sbdPortion * RATES_2025.sbd_combined;
  const taxOnGen = genPortion * RATES_2025.gen_combined;

  const corporateTaxes = taxOnSBD + taxOnGen;
  const effectiveRate = p > 0 ? corporateTaxes / p : 0;

  return { profitBeforeTax: p, sbdPortion, genPortion, taxOnSBD, taxOnGen, corporateTaxes, effectiveRate };
}
