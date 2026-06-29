"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataSourcesApi, type DataSource } from "@/lib/api";

export function ConnectDbDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (ds: DataSource) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [schema, setSchema] = useState("public");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    dataSourcesApi
      .create({
        name: name.trim() || "My database",
        connectionString: url.trim(),
        schema: schema.trim() || undefined,
      })
      .then(async (ds) => {
        await dataSourcesApi.introspect(ds.id);
        setUrl("");
        setName("");
        setSchema("public");
        onConnected(ds);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not connect"),
      )
      .finally(() => setPending(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-medium">Connect a database</h2>
        <p className="mt-1 text-sm text-muted">
          Paste a PostgreSQL connection string. Prefer a read-only user — Sift
          only ever runs SELECTs, but read-only credentials are safest.
        </p>
        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            Name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My database"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            Connection string
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="postgresql://user:pass@host:5432/dbname"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            Schema
            <Input
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder="public"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !url.trim()}>
              {pending ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
