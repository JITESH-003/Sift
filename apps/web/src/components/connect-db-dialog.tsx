"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataSourcesApi, type DataSource } from "@/lib/api";

export function ConnectDbDialog({
  open,
  onClose,
  onDone,
  reconnect,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (ds?: DataSource) => void;
  reconnect?: { id: string; name: string } | null;
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
    const run = async (): Promise<DataSource | undefined> => {
      if (reconnect) {
        await dataSourcesApi.connect(reconnect.id, url.trim());
        return undefined;
      }
      const ds = await dataSourcesApi.create({
        name: name.trim() || "My database",
        connectionString: url.trim(),
        schema: schema.trim() || undefined,
      });
      await dataSourcesApi.introspect(ds.id);
      return ds;
    };
    run()
      .then((ds) => {
        setUrl("");
        setName("");
        setSchema("public");
        onDone(ds);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not connect"),
      )
      .finally(() => setPending(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-medium">
          {reconnect ? `Reconnect ${reconnect.name}` : "Connect a database"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {reconnect
            ? "Your connection string is never stored, so paste it again to resume this database for the rest of your session."
            : "Paste a PostgreSQL connection string. Prefer a read-only user — Sift only ever runs SELECTs, but read-only credentials are safest."}
        </p>
        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {reconnect ? null : (
            <label className="flex flex-col gap-1.5 text-sm text-muted">
              Name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My database"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            Connection string
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="postgresql://user:pass@host:5432/dbname"
              required
            />
          </label>
          {reconnect ? null : (
            <label className="flex flex-col gap-1.5 text-sm text-muted">
              Schema
              <Input
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="public"
              />
            </label>
          )}
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
              {pending
                ? reconnect
                  ? "Reconnecting…"
                  : "Connecting…"
                : reconnect
                  ? "Reconnect"
                  : "Connect"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
