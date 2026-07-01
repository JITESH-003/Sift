"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Answer } from "@/components/chat/answer";
import { FeedbackButtons } from "@/components/chat/feedback-buttons";
import { ConnectDbDialog } from "@/components/connect-db-dialog";
import { SchemaDialog } from "@/components/schema-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askStream,
  conversationsApi,
  dataSourcesApi,
  type AskResult,
  type Conversation,
  type DataSource,
  type Message,
  type SchemaJson,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Turn = {
  id: number;
  question: string;
  status: string | null;
  sql: string | null;
  answer: AskResult | null;
};

const SUGGESTIONS = [
  "Total revenue by month",
  "How many orders per status?",
  "Top 5 products by revenue",
  "Revenue by customer country",
];

const STATUS_LABEL: Record<string, string> = {
  generating: "Generating SQL…",
  executing: "Running the query…",
  retrying: "Fixing the query…",
};

const CONFIDENCE_VARIANT: Record<string, "success" | "accent" | "neutral"> = {
  high: "success",
  medium: "accent",
  low: "neutral",
};

export default function AppHome() {
  const router = useRouter();
  const { user, hydrated, logout } = useAuth();
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [activeDsId, setActiveDsId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [connected, setConnected] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectFor, setReconnectFor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [schema, setSchema] = useState<SchemaJson | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const turnSeq = useRef(0);
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || started.current) return;
    started.current = true;
    void (async () => {
      try {
        let sources = await dataSourcesApi.list();
        if (sources.length === 0) {
          const demo = await dataSourcesApi.create({
            name: "Demo e-commerce",
            schema: "demo",
          });
          await dataSourcesApi.introspect(demo.id);
          sources = [demo];
        }
        setDataSources(sources);
        const ds = sources[0];
        setActiveDsId(ds.id);
        await loadSchema(ds.id);
        const convos = await conversationsApi.list();
        setConversations(convos);
        const mine = convos.filter((c) => c.dataSourceId === ds.id);
        if (mine.length > 0) {
          await openConversation(mine[0].id);
        } else {
          const created = await conversationsApi.create({
            dataSourceId: ds.id,
          });
          setConversations((prev) => [created, ...prev]);
          setActiveConvoId(created.id);
        }
      } catch (e) {
        setBootError(e instanceof Error ? e.message : "Setup failed");
      } finally {
        setBooting(false);
      }
    })();
  }, [hydrated, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, history]);

  async function loadSchema(dsId: string) {
    let full = await dataSourcesApi.get(dsId);
    setConnected(full.connected);
    if (!full.snapshot && full.connected) {
      await dataSourcesApi.introspect(dsId);
      full = await dataSourcesApi.get(dsId);
    }
    setSchema(full.snapshot?.schemaJson ?? null);
  }

  async function refreshSchema() {
    if (!activeDsId) return;
    setRefreshing(true);
    try {
      await dataSourcesApi.introspect(activeDsId);
      await loadSchema(activeDsId);
    } finally {
      setRefreshing(false);
    }
  }

  async function openConversation(convoId: string) {
    setActiveConvoId(convoId);
    setTurns([]);
    const detail = await conversationsApi.get(convoId);
    setHistory(detail.messages);
  }

  async function newChat() {
    if (!activeDsId) return;
    const created = await conversationsApi.create({
      dataSourceId: activeDsId,
    });
    setConversations((prev) => [created, ...prev]);
    setActiveConvoId(created.id);
    setHistory([]);
    setTurns([]);
  }

  async function selectDataSource(dsId: string) {
    if (dsId === activeDsId) return;
    setActiveDsId(dsId);
    setTurns([]);
    setHistory([]);
    await loadSchema(dsId);
    const mine = conversations.filter((c) => c.dataSourceId === dsId);
    if (mine.length > 0) {
      await openConversation(mine[0].id);
    } else {
      const created = await conversationsApi.create({
        dataSourceId: dsId,
      });
      setConversations((prev) => [created, ...prev]);
      setActiveConvoId(created.id);
    }
  }

  function openConnect() {
    setReconnectFor(null);
    setConnectOpen(true);
  }

  function openReconnect() {
    const ds = dataSources.find((d) => d.id === activeDsId);
    if (!ds) return;
    setReconnectFor({ id: ds.id, name: ds.name });
    setConnectOpen(true);
  }

  function onDialogDone(ds?: DataSource) {
    setConnectOpen(false);
    setReconnectFor(null);
    if (!ds) {
      setConnected(true);
      if (activeDsId) void loadSchema(activeDsId);
      return;
    }
    setDataSources((prev) => [ds, ...prev]);
    setActiveDsId(ds.id);
    setTurns([]);
    setHistory([]);
    void (async () => {
      await loadSchema(ds.id);
      const created = await conversationsApi.create({
        dataSourceId: ds.id,
      });
      setConversations((prev) => [created, ...prev]);
      setActiveConvoId(created.id);
    })();
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || !activeConvoId || asking) return;
    if (!connected) {
      openReconnect();
      return;
    }
    setInput("");
    const id = (turnSeq.current += 1);
    setTurns((prev) => [
      ...prev,
      { id, question: q, status: "Starting…", sql: null, answer: null },
    ]);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvoId && !c.title ? { ...c, title: q.slice(0, 60) } : c,
      ),
    );
    setAsking(true);
    const patch = (changes: Partial<Turn>) =>
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...changes } : t)),
      );
    try {
      await askStream(activeConvoId, q, {
        onStatus: (value) => patch({ status: STATUS_LABEL[value] ?? value }),
        onSql: (sql) => patch({ sql }),
        onFinal: (answer) => {
          patch({ answer, status: null });
          if (answer.status === "disconnected") setConnected(false);
        },
        onError: (message) =>
          patch({
            status: null,
            answer: {
              status: "error",
              sql: "",
              error: message,
              meta: {
                confidence: "low",
                retried: false,
                provider: "-",
                promptTokens: 0,
                completionTokens: 0,
              },
            },
          }),
      });
    } finally {
      setAsking(false);
    }
  }

  if (!hydrated || !user) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-subtle">
        Loading…
      </main>
    );
  }

  const myConversations = conversations.filter(
    (c) => c.dataSourceId === activeDsId,
  );
  const empty = history.length === 0 && turns.length === 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-64 flex-col border-r border-border bg-surface-muted">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-medium">Sift</span>
        </div>
        <div className="flex flex-col gap-2 px-3">
          <select
            value={activeDsId ?? ""}
            onChange={(e) => void selectDataSource(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-accent"
          >
            {dataSources.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={openConnect}>
            Connect a database
          </Button>
          <Button size="sm" onClick={() => void newChat()}>
            New chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSchemaOpen(true)}
            disabled={!schema}
          >
            View schema diagram
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshSchema()}
            disabled={refreshing || !activeDsId || !connected}
          >
            {refreshing ? "Refreshing…" : "Refresh schema"}
          </Button>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
          {myConversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void openConversation(c.id)}
              className={`mb-1 w-full truncate rounded-lg px-3 py-2 text-left text-sm transition ${
                c.id === activeConvoId
                  ? "bg-surface text-foreground"
                  : "text-muted hover:bg-surface"
              }`}
            >
              {c.title ?? "Untitled chat"}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
          <span className="truncate">{user.name ?? user.email}</span>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/");
            }}
            className="text-accent hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {bootError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {bootError}
              </p>
            ) : null}

            {empty && !booting ? (
              <div className="mt-10 text-center">
                <h1 className="text-3xl font-light">Ask your data anything</h1>
                <p className="mt-2 text-muted">
                  Plain-English questions become safe, read-only SQL.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground transition hover:border-accent hover:text-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {history.map((m) =>
              m.role === "user" ? (
                <div
                  key={m.id}
                  className="max-w-[80%] self-end rounded-2xl bg-accent px-4 py-2 text-sm text-accent-foreground"
                >
                  {m.content}
                </div>
              ) : (
                <div
                  key={m.id}
                  className="rounded-xl border border-border bg-surface p-3 text-sm"
                >
                  <p className="text-muted">{m.content}</p>
                  {m.query ? (
                    <>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-foreground">
                        {m.query.sql}
                      </pre>
                      <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
                        <Badge
                          variant={CONFIDENCE_VARIANT[m.query.confidence]}
                        >
                          {m.query.confidence} confidence
                        </Badge>
                        <span>
                          {(m.query.promptTokens ?? 0) +
                            (m.query.completionTokens ?? 0)}{" "}
                          tokens
                        </span>
                      </div>
                      {m.query.status === "ok" ? (
                        <FeedbackButtons messageId={m.id} />
                      ) : null}
                    </>
                  ) : null}
                </div>
              ),
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-3">
                <div className="max-w-[80%] self-end rounded-2xl bg-accent px-4 py-2 text-sm text-accent-foreground">
                  {turn.question}
                </div>
                {turn.answer ? (
                  <Answer answer={turn.answer} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {turn.sql ? (
                      <pre className="overflow-x-auto rounded-xl border border-border bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                        {turn.sql}
                      </pre>
                    ) : null}
                    <div className="flex items-center gap-2 text-sm text-subtle">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                      {turn.status ?? "Thinking…"}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border px-4 py-4">
          {!connected && !booting ? (
            <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                This database is disconnected. Reconnect to keep chatting — your
                connection string is never stored.
              </span>
              <Button size="sm" onClick={openReconnect}>
                Reconnect
              </Button>
            </div>
          ) : null}
          <form
            className="mx-auto flex max-w-3xl items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                booting
                  ? "Setting up…"
                  : !connected
                    ? "Reconnect to ask a question…"
                    : "Ask a question…"
              }
              disabled={booting || asking || !connected}
            />
            <Button
              type="submit"
              disabled={booting || asking || !connected || !input.trim()}
            >
              {asking ? "…" : "Ask"}
            </Button>
          </form>
        </div>
      </main>

      <ConnectDbDialog
        open={connectOpen}
        onClose={() => {
          setConnectOpen(false);
          setReconnectFor(null);
        }}
        onDone={onDialogDone}
        reconnect={reconnectFor}
      />
      <SchemaDialog
        open={schemaOpen}
        onClose={() => setSchemaOpen(false)}
        schema={schema}
      />
    </div>
  );
}
