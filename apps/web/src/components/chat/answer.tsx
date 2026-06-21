import type { AskResult } from "@/lib/api";
import { ChartView } from "./chart-view";
import { Transparency } from "./transparency";

export function Answer({ answer }: { answer: AskResult }) {
  if (answer.status === "blocked") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">I refused to run that query.</p>
        <p className="mt-1">{answer.reason}</p>
        <Transparency meta={answer.meta} />
      </div>
    );
  }
  if (answer.status === "error") {
    return (
      <div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">The query could not be run.</p>
          <p className="mt-1">{answer.error}</p>
        </div>
        <Transparency sql={answer.sql || undefined} meta={answer.meta} />
      </div>
    );
  }
  return (
    <div>
      <ChartView chart={answer.chart} rows={answer.rows} />
      <Transparency
        sql={answer.sql}
        meta={answer.meta}
        cached={answer.cached}
        latencyMs={answer.latencyMs}
        rowCount={answer.rowCount}
      />
    </div>
  );
}
