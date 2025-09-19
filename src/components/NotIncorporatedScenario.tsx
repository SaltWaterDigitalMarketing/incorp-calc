import React, { useMemo, useState } from "react";
import { calculateUnincorporated } from "@/engine/calcUnincorporated";

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 2 }) : "—";
const pct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(2) + "%" : "—");

export default function NotIncorporatedScenario() {
  const [businessIncome, setBusinessIncome] = useState(100_000); // matches how your calc uses input.businessIncome

  const res = useMemo(
    () => calculateUnincorporated({ businessIncome }), // your function expects CalcInput with businessIncome
    [businessIncome]
  );

  return (
    <div>
      <label className="text-sm block mb-2">
        Personal/Business Income (uninc)
        <input
          type="number"
          className="w-full mt-1 rounded-xl bg-slate-900 border border-white/10 px-3 py-2"
          value={businessIncome}
          onChange={(e) => setBusinessIncome(parseFloat(e.target.value || "0"))}
        />
      </label>

      <div className="space-y-2 mt-2">
        <Row label="Gross income required" value={fmt(res.grossSalary)} />
        <Row label="Personal taxes" value={fmt(res.personalTaxes)} />
        <Row label="CPP (employee/self-employed)" value={fmt(res.personalCPP)} />
        <Row label="Net to you" value={fmt(res.personalCash)} big />
        <Row label="Effective tax rate (incl. CPP)" value={pct(res.totalTaxRate)} pill />
        <Row label="RRSP room" value={fmt(res.rrspRoom)} />
      </div>
    </div>
  );
}

function Row({ label, value, big, pill }: { label: string; value: string; big?: boolean; pill?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 last:border-b-0 py-2">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={(pill ? "px-2 py-0.5 rounded-full bg-white/5 border border-white/10 " : "") + (big ? "text-lg font-bold " : "") + "tabular-nums font-mono"}>
        {value}
      </div>
    </div>
  );
}
