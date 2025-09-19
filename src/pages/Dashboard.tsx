// src/pages/Dashboard.tsx
import React, { useMemo, useState } from "react";
import { calculateUnincorporated } from "@/engine/calcUnincorporated";
import { calculateIncorporatedSalary } from "@/components/SalaryScenario";
import { calculateIncorporatedDividends } from "@/components/DividendScenario";

/* ------------ Types (matches what calculators return) ------------ */
export type ScenarioKey = "uninc" | "salary" | "dividends";
export interface ScenarioOutput {
  scenario: ScenarioKey | string;
  grossSalary?: number;
  eligibleDividends?: number;
  nonEligibleDividends?: number;
  corporateTaxes: number;
  corporateCPP: number;
  personalTaxes: number;
  totalTaxes: number;
  totalCPP: number;
  personalCPP: number;
  corporateCash: number;
  personalCash: number;
  totalCash: number;
  totalTaxRate: number; // 0–1
  rrspRoom?: number;
  federalTax?: number;
  provincialTax?: number;
  taxableIncome?: number;
  _cappedByAfterTaxProfit?: boolean;
}

/* ------------ Format helpers ------------ */
const fmt = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const money = (n: number) => fmt.format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(((Number.isFinite(n) ? n : 0)) * 100).toFixed(1)}%`;

/* ------------ Small UI atoms ------------ */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-600">{children}</label>;
}
function NumberInput({
  value,
  onChange,
  prefix = "$",
  step = 1000,
  min = 0,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  step?: number;
  min?: number;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-9 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
        value={isFinite(value) ? value : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ------------ Scenario card (shows split on Dividends) ------------ */
function ScenarioCard({
  title,
  color,
  data,
}: {
  title: string;
  color: string;
  data?: ScenarioOutput;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 whitespace-nowrap">
          {title}
        </h3>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>

      {!data ? (
        <div className="text-sm text-slate-500">Enter inputs and click Calculate.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Total Taxes", money(data.totalTaxes)],
              ["Effective Rate", pct(data.totalTaxRate)],
              ["Personal Cash", money(data.personalCash)],
              ["Corporate Cash", money(data.corporateCash)],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-[10px] font-semibold tracking-wide text-slate-500/90 uppercase whitespace-nowrap">
                  {label}
                </div>
                <div className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* If dividends scenario, show split caption */}
          {typeof (data as any)?.eligibleDividends === "number" &&
            typeof (data as any)?.nonEligibleDividends === "number" && (
              <div className="mt-2 text-xs text-slate-600">
                <span className="mr-4">
                  Non-eligible:{" "}
                  <span className="font-medium tabular-nums">
                    {money((data as any).nonEligibleDividends)}
                  </span>
                </span>
                <span>
                  Eligible:{" "}
                  <span className="font-medium tabular-nums">
                    {money((data as any).eligibleDividends)}
                  </span>
                </span>
              </div>
            )}
        </>
      )}
    </div>
  );
}

/* ------------ Simple CSS bar comparison (hardened) ------------ */
function ComparisonBars({
  results,
}: {
  results: Record<ScenarioKey, ScenarioOutput>;
}) {
  const val = (v: unknown) => (Number.isFinite(v as number) ? (v as number) : 0);

  const maxTax =
    Math.max(
      val(results.uninc?.totalTaxes),
      val(results.salary?.totalTaxes),
      val(results.dividends?.totalTaxes)
    ) || 1;

  const rows: Array<{ key: ScenarioKey; label: string; color: string }> = [
    { key: "uninc", label: "Not Incorporated", color: "#fb7185" },
    { key: "salary", label: "Incorporated – Salary", color: "#60a5fa" },
    { key: "dividends", label: "Incorporated – Dividends", color: "#34d399" },
  ];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Tax & CPP Comparison</h3>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const tax = val(results[r.key]?.totalTaxes) + val(results[r.key]?.totalCPP);
          const w = Math.max(6, Math.round((tax / maxTax) * 100));
          return (
            <div key={r.key} className="flex items-center gap-3">
              <div className="w-40 text-xs text-slate-600">{r.label}</div>
              <div className="h-8 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-8 rounded-full"
                  style={{ width: `${w}%`, background: r.color }}
                  title={money(tax)}
                />
              </div>
              <div className="w-28 text-right text-sm font-medium text-slate-800">
                {money(tax)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------ Main Dashboard ------------ */
export default function Dashboard() {
  // Fixed: BC, 2025 rules
  const [businessIncome, setBusinessIncome] = useState(150_000);
  const [personalCashNeeded, setPersonalCashNeeded] = useState(100_000);

  const [results, setResults] = useState<Partial<
    Record<ScenarioKey, ScenarioOutput>
  >>({});

  // ✅ Build a proper record when all three exist; otherwise null
  const allReady: (Record<ScenarioKey, ScenarioOutput> | null) = useMemo(() => {
    if (results.uninc && results.salary && results.dividends) {
      return {
        uninc: results.uninc,
        salary: results.salary,
        dividends: results.dividends,
      };
    }
    return null;
  }, [results.uninc, results.salary, results.dividends]);

  const handleCalculate = () => {
    try {
      const uninc = calculateUnincorporated({ businessIncome }) as ScenarioOutput;

      const sal = calculateIncorporatedSalary({
        businessIncome,
        personalCashNeeded,
      }) as ScenarioOutput;

      const divs = calculateIncorporatedDividends({
        businessIncome,
        personalCashNeeded,
      }) as ScenarioOutput;

      setResults({ uninc, salary: sal, dividends: divs });
    } catch (e) {
      console.error("Calc error:", e);
      alert("There was an error running the calculators. Check console for details.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mx-auto mb-6 max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              BC Tax Strategy Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">BC • 2025 rules</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Inputs */}
        <div className="lg:col-span-1">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">
              Inputs (BC • 2025)
            </h2>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Business Income</Label>
                  <NumberInput value={businessIncome} onChange={setBusinessIncome} />
                </div>
                <div>
                  <Label>Cash Needed (personal, after tax/CPP)</Label>
                  <NumberInput
                    value={personalCashNeeded}
                    onChange={setPersonalCashNeeded}
                  />
                </div>
              </div>

              <button
                onClick={handleCalculate}
                className="mt-2 inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                Calculate
              </button>

              <p className="text-xs leading-5 text-slate-500">
                Effective rate includes CPP where applicable. Unincorporated uses your
                Business Income as total income.
              </p>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-6">
            {/* One card per row */}
            <ScenarioCard title="Not Incorporated" color="#fb7185" data={results.uninc} />
            <ScenarioCard title="Incorporated – Salary" color="#60a5fa" data={results.salary} />
            <ScenarioCard title="Incorporated – Dividends" color="#34d399" data={results.dividends} />

            {allReady && <ComparisonBars results={allReady} />}

            {/* Detailed Breakdown */}
            {allReady && (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  Detailed Breakdown
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-medium">Line Item</th>
                        <th className="py-2 pr-4 font-medium">Not Inc.</th>
                        <th className="py-2 pr-4 font-medium">Inc. Salary</th>
                        <th className="py-2 pr-4 font-medium">Inc. Dividends</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["Dividends — non-eligible", 0, 0, allReady.dividends.nonEligibleDividends ?? 0],
                        ["Dividends — eligible",     0, 0, allReady.dividends.eligibleDividends ?? 0],

                        ["Personal Taxes",  allReady.uninc.personalTaxes,  allReady.salary.personalTaxes,  allReady.dividends.personalTaxes],
                        ["Corporate Taxes", allReady.uninc.corporateTaxes, allReady.salary.corporateTaxes, allReady.dividends.corporateTaxes],
                        ["CPP (Total)",     allReady.uninc.totalCPP,       allReady.salary.totalCPP,       allReady.dividends.totalCPP],
                        ["Total Taxes",     allReady.uninc.totalTaxes,     allReady.salary.totalTaxes,     allReady.dividends.totalTaxes],
                        ["Effective Rate",  allReady.uninc.totalTaxRate,   allReady.salary.totalTaxRate,   allReady.dividends.totalTaxRate, true],
                        ["Personal Cash",   allReady.uninc.personalCash,   allReady.salary.personalCash,   allReady.dividends.personalCash],
                        ["Corporate Cash",  allReady.uninc.corporateCash,  allReady.salary.corporateCash,  allReady.dividends.corporateCash],
                      ].map((row, idx) => {
                        const isPct = row[4] === true;
                        const v1 = row[1] as number;
                        const v2 = row[2] as number;
                        const v3 = row[3] as number;
                        return (
                          <tr key={idx}>
                            <td className="py-2 pr-4 text-slate-600">{row[0] as string}</td>
                            <td className="py-2 pr-4 font-medium text-slate-800">
                              {isPct ? pct(v1) : money(v1)}
                            </td>
                            <td className="py-2 pr-4 font-medium text-slate-800">
                              {isPct ? pct(v2) : money(v2)}
                            </td>
                            <td className="py-2 pr-2 font-medium text-slate-800">
                              {isPct ? pct(v3) : money(v3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mx-auto mt-8 max-w-7xl text-center text-xs text-slate-500">
        BC 2025 assumptions. Powered by your calculator engine.
      </div>
    </div>
  );
}
