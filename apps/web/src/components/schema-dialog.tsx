"use client";

import { Button } from "@/components/ui/button";
import { SchemaDiagram } from "@/components/schema-diagram";
import type { SchemaJson } from "@/lib/api";

export function SchemaDialog({
  open,
  onClose,
  schema,
}: {
  open: boolean;
  onClose: () => void;
  schema: SchemaJson | null;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Schema diagram</h2>
            <p className="text-sm text-subtle">
              {schema
                ? `${schema.tables.length} tables · schema "${schema.schema}"`
                : "No schema yet"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-surface-muted p-4">
          {schema ? (
            <SchemaDiagram schema={schema} />
          ) : (
            <p className="text-sm text-muted">
              Connect or introspect a database first.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
