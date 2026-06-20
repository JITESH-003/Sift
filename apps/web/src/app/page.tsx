"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type HealthState = "checking" | "ok" | "down";

const statusCopy: Record<HealthState, string> = {
  checking: "Checking API…",
  ok: "API online",
  down: "API unreachable",
};

const statusDot: Record<HealthState, string> = {
  checking: "bg-amber-500",
  ok: "bg-success",
  down: "bg-red-500",
};

export default function Home() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/health`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(() => {
        if (active) setHealth("ok");
      })
      .catch(() => {
        if (active) setHealth("down");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="flex flex-col items-center gap-7">
        <Badge variant="neutral" className="shadow-sm">
          <span
            className={`h-2 w-2 rounded-full ${statusDot[health]} ${
              health === "checking" ? "animate-pulse" : ""
            }`}
          />
          {statusCopy[health]}
        </Badge>
        <h1 className="text-7xl font-light tracking-tight sm:text-8xl">Sift</h1>
        <p className="max-w-md text-lg leading-8 text-muted">
          Talk to your data. Ask a question in plain English and get the chart —
          plus the exact, safely-executed SQL behind it.
        </p>
        <div className="mt-1 h-px w-16 bg-accent/60" />
        <p className="text-xs uppercase tracking-[0.2em] text-subtle">
          Phase 0 · rails online
        </p>
      </div>
    </main>
  );
}
