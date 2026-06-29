"use client";

import { useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import type { SchemaJson } from "@/lib/api";

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_") || "_";
}

function toMermaid(schema: SchemaJson): string {
  const lines = ["erDiagram"];
  for (const table of schema.tables) {
    lines.push(`  ${safe(table.name)} {`);
    for (const col of table.columns) {
      const keys = [col.isPrimaryKey ? "PK" : "", col.references ? "FK" : ""]
        .filter(Boolean)
        .join(",");
      lines.push(
        `    ${safe(col.type)} ${safe(col.name)}${keys ? ` ${keys}` : ""}`,
      );
    }
    lines.push("  }");
  }
  const tableNames = new Set(schema.tables.map((t) => t.name));
  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (!col.references) continue;
      const parent = col.references.split(".")[0];
      if (!tableNames.has(parent)) continue;
      lines.push(
        `  ${safe(parent)} ||--o{ ${safe(table.name)} : "${safe(col.name)}"`,
      );
    }
  }
  return lines.join("\n");
}

let counter = 0;

const CONTROL =
  "rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-foreground transition hover:border-accent hover:text-accent";

export function SchemaDiagram({ schema }: { schema: SchemaJson }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: "14px",
          primaryColor: "#ffffff",
          primaryBorderColor: "#ddcdb4",
          primaryTextColor: "#211c15",
          lineColor: "#c2410c",
        },
      });
      counter += 1;
      try {
        const result = await mermaid.render(
          `sift-er-${counter}`,
          toMermaid(schema),
        );
        if (active) {
          setSvg(result.svg);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [schema]);

  if (error) {
    return (
      <p className="text-sm text-muted">Could not render the schema diagram.</p>
    );
  }

  return (
    <TransformWrapper minScale={0.2} maxScale={4} limitToBounds={false} centerOnInit>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className="relative h-[65vh] w-full">
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            <button
              type="button"
              className={CONTROL}
              onClick={() => zoomIn()}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className={CONTROL}
              onClick={() => zoomOut()}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className={CONTROL}
              onClick={() => resetTransform()}
            >
              Reset
            </button>
          </div>
          <TransformComponent
            wrapperClass="!h-full !w-full"
            contentClass="!h-full !w-full"
          >
            <div
              className="[&_svg]:h-auto [&_svg]:max-w-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </TransformComponent>
          <p className="absolute bottom-2 left-2 text-xs text-subtle">
            Scroll to zoom · drag to pan
          </p>
        </div>
      )}
    </TransformWrapper>
  );
}
