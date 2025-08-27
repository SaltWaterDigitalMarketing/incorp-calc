export type Input = {
  businessIncome: number;
  personalCashNeeded?: number; // not used yet
  province: "BC";
  taxYear: 2025;
};

export type Output = {
  grossSalary: number;
  eligibleDividends: number;
  nonEligibleDividends: number;
  corporateTaxes: number;
  corporateCPP: number;
  personalTaxes: number;
  totalTaxes: number;
  totalCPP: number;
  personalCPP: number;
  corporateCash: number;
  personalCash: number;
  totalCash: number;
  totalTaxRate: number;
  rrspRoom: number;

  // helpers (not shown in your final table if you don’t want)
  federalTax: number;
  provincialTax: number;
  taxableIncome: number;
};