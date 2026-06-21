"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { AskMeta } from "@/lib/api";

const CONFIDENCE: Record<
  AskMeta["confidence"],
  { label: string; variant: "success" | "accent" | "neutral" }
> = {
  high: { label: "High confidence", variant: "success" },
  medium: { label: "Medium confidence", variant: "accent" },
  low: { label: "Low confidence", variant: "neutral" },
};

export function Transparency({
  sql,
  meta,
  cached,
  latencyMs,
  rowCount,
}: {
  sql?: string;
  meta: AskMeta;
  cached?: boolean;
  latencyMs?: number;
  rowCount?: number;
}) {
  const [copied, setCopied] = useState(false);
  const confidence = CONFIDENCE[meta.confidence];

  function copy() {
    if (!sql) return;
    void navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const bits: string[] = [meta.provider];
  if (meta.retried) bits.push("retried once");
  bits.push(`${meta.promptTokens + meta.completionTokens} tokens`);
  if (typeof latencyMs === "number") bits.push(`${latencyMs} ms`);
  if (typeof rowCount === "number") bits.push(`${rowCount} rows`);
  if (cached) bits.push("cached");

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">
            SQL
          </span>
          <Badge variant={confidence.variant}>{confidence.label}</Badge>
        </div>
        {sql ? (
          <button
            type="button"
            onClick={copy}
            className="text-xs text-accent hover:underline"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
      {sql ? (
        <pre className="overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
          {sql}
        </pre>
      ) : null}
      <div className="mt-2 text-xs text-subtle">{bits.join(" · ")}</div>
    </div>
  );
}
