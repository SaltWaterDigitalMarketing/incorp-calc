import NotIncorporatedScenario from "@/components/NotIncorporatedScenario";
import SalaryScenario from "@/components/SalaryScenario";
import DividendScenario from "@/components/DividendScenario";

export default function CalculatorPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-bold">Tax Savings Calculator</h1>
        <p className="text-slate-400 text-sm">Compare all three structures. CPP is separate (excluded from “taxes”).</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h2 className="font-semibold mb-3">Not Incorporated</h2>
            <NotIncorporatedScenario />
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h2 className="font-semibold mb-3">Incorporated — Salary</h2>
            <SalaryScenario />
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <h2 className="font-semibold mb-3">Incorporated — Dividends</h2>
            <DividendScenario />
          </section>
        </div>
      </div>
    </div>
  );
}
