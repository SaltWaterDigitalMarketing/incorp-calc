import { useMemo, useState } from "react";
import { calculateUnincorporated } from "./engine/calcUnincorporated";
import type { Output } from "./engine/types";
import "./styles.css";

import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

function currency(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}
function pct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

export default function App() {
  const [income, setIncome] = useState<number>(150_000);

  const result: Output = useMemo(
    () => calculateUnincorporated({ businessIncome: income, province: "BC", taxYear: 2025 }),
    [income]
  );

  // Pie must sum to 100% of grossSalary => cash = gross - totalTaxes - totalCPP
  const pieCash = Math.max(0, result.grossSalary - result.totalTaxes - result.totalCPP);
  const data = {
    labels: ["Total Cash", "Total Taxes", "Total CPP"],
    datasets: [
      {
        data: [pieCash, result.totalTaxes, result.totalCPP],
      },
    ],
  };

  return (
    <div className="container">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <h1>Unincorporated Tax Calculator (BC · 2025)</h1>
        <span className="badge">Tax tables v2025.1</span>
      </div>

      <div className="grid">
        <div className="card">
          <div style={{display:"grid", gap:12}}>
            <div>
              <label>Business Income</label>
              <input type="number" min={0} step={100}
                value={income}
                onChange={(e)=> setIncome(Number(e.target.value || 0))}
                inputMode="numeric" />
              <div className="hint">Enter gross self-employment income before taxes/CPP.</div>
            </div>
          </div>
        </div>

        <div className="card">
          <Pie data={data} />
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <table className="table">
          <thead>
            <tr><th>Field</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>grossSalary</td><td>{currency(result.grossSalary)}</td></tr>
            <tr><td>personalTaxes</td><td>{currency(result.personalTaxes)}</td></tr>
            <tr><td>personalCPP</td><td>{currency(result.personalCPP)}</td></tr>
            <tr><td>corporateTaxes</td><td>{currency(result.corporateTaxes)}</td></tr>
            <tr><td>corporateCPP</td><td>{currency(result.corporateCPP)}</td></tr>
            <tr><td>totalTaxes</td><td>{currency(result.totalTaxes)}</td></tr>
            <tr><td>totalCPP</td><td>{currency(result.totalCPP)}</td></tr>
            <tr><td>personalCash</td><td>{currency(result.personalCash)}</td></tr>
            <tr><td>totalCash</td><td>{currency(result.totalCash)}</td></tr>
            <tr><td>totalTaxRate</td><td>{pct(result.totalTaxRate)}</td></tr>
            <tr><td>rrspRoom</td><td>{currency(result.rrspRoom)}</td></tr>
            <tr><td>taxableIncome (gross − ½CPP)</td><td>{currency(result.taxableIncome)}</td></tr>
            <tr><td>federalTax</td><td>{currency(result.federalTax)}</td></tr>
            <tr><td>bcTax</td><td>{currency(result.provincialTax)}</td></tr>
          </tbody>
        </table>
        <div className="hint" style={{marginTop:8}}>
          Assumptions: BC 2025 brackets; no credits; CPP split 50/50 with deductible employer half; RRSP room = min(18% × gross, $32,490).
        </div>
      </div>
    </div>
  );
}
