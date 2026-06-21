"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Chart } from "@/lib/api";

const ACCENT = "#c2410c";
const MUTED = "#6f6456";
const GRID = "#ece0cf";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function axisLabel(value: unknown): string {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})/.exec(value);
    return match ? `${match[1]}-${match[2]}` : value;
  }
  return String(value);
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") {
    const n = Number(value);
    return value !== "" && Number.isFinite(n) ? n.toLocaleString() : value;
  }
  return String(value);
}

export function ChartView({
  chart,
  rows,
}: {
  chart: Chart;
  rows: Record<string, unknown>[];
}) {
  if (chart.type === "stat") {
    return (
      <div className="rounded-xl border border-border bg-surface-muted px-6 py-8 text-center">
        <div className="text-xs uppercase tracking-wide text-subtle">
          {chart.label}
        </div>
        <div className="mt-2 font-serif text-5xl font-light text-foreground">
          {cell(chart.value)}
        </div>
      </div>
    );
  }

  if (chart.type === "table") {
    const display = rows.slice(0, 100);
    return (
      <div className="max-h-80 overflow-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface-muted text-subtle">
            <tr>
              {chart.columns.map((col) => (
                <th key={col} className="px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, index) => (
              <tr key={index} className="border-t border-border">
                {chart.columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-foreground">
                    {cell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const data = rows.map((row) => ({
    x: axisLabel(row[chart.x]),
    y: toNumber(row[chart.y]),
  }));

  return (
    <div className="h-72 w-full rounded-xl border border-border bg-surface p-3">
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="y"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip />
            <Bar dataKey="y" fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
