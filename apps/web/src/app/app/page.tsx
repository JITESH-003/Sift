"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Answer } from "@/components/chat/answer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askStream,
  conversationsApi,
  dataSourcesApi,
  type AskResult,
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

export default function AppHome() {
  const router = useRouter();
  const { user, hydrated, logout } = useAuth();
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
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
        const sources = await dataSourcesApi.list();
        const existing = sources[0];
        let dataSourceId: string;
        if (existing) {
          dataSourceId = existing.id;
          const full = await dataSourcesApi.get(existing.id);
          if (!full.snapshot) await dataSourcesApi.introspect(existing.id);
        } else {
          const created = await dataSourcesApi.create({
            name: "Demo e-commerce",
            schema: "demo",
          });
          dataSourceId = created.id;
          await dataSourcesApi.introspect(created.id);
        }
        const conversations = await conversationsApi.list();
        const convo =
          conversations.find((c) => c.dataSourceId === dataSourceId) ??
          (await conversationsApi.create({
            dataSourceId,
            title: "Demo session",
          }));
        setConversationId(convo.id);
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
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || !conversationId || asking) return;
    setInput("");
    const id = (turnSeq.current += 1);
    setTurns((prev) => [
      ...prev,
      { id, question: q, status: "Starting…", sql: null, answer: null },
    ]);
    setAsking(true);
    const patch = (changes: Partial<Turn>) =>
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...changes } : t)),
      );
    try {
      await askStream(conversationId, q, {
        onStatus: (value) => patch({ status: STATUS_LABEL[value] ?? value }),
        onSql: (sql) => patch({ sql }),
        onFinal: (answer) => patch({ answer, status: null }),
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

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-medium">Sift</span>
          <span className="text-sm text-subtle">Demo e-commerce</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{user.name ?? user.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              router.replace("/");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {bootError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {bootError}
            </p>
          ) : null}

          {turns.length === 0 && !booting ? (
            <div className="mt-10 text-center">
              <h1 className="text-3xl font-light">Ask your data anything</h1>
              <p className="mt-2 text-muted">
                Questions run against the seeded demo e-commerce database.
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
            placeholder={booting ? "Setting up the demo…" : "Ask a question…"}
            disabled={booting || asking}
          />
          <Button type="submit" disabled={booting || asking || !input.trim()}>
            {asking ? "…" : "Ask"}
          </Button>
        </form>
      </div>
    </main>
  );
}
