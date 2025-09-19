// Shared input for all scenarios
export type CalcInput = {
  businessIncome: number;
  personalCashNeeded: number;   // <-- new
  province: "BC";
  taxYear: 2025;
};

// All scenarios we’ll support
export type Scenario = "UNINCORPORATED" | "INC_SALARY" | "INC_DIVIDENDS";

// Unified output shape (works for all scenarios)
export type ScenarioOutput = {
  scenario: Scenario;

  grossSalary: number;          // 0 if N/A
  eligibleDividends: number;    // 0 if N/A
  nonEligibleDividends: number; // 0 if N/A

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

  // helpers
  federalTax: number;
  provincialTax: number;
  taxableIncome: number;
};

// --- Back-compat so the current UI keeps compiling ---
export type Input = CalcInput;
export type Output = ScenarioOutput;
