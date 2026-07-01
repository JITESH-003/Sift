"use client";

import { useState } from "react";
import { feedbackApi } from "@/lib/api";

function ThumbIcon({ down }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 ${down ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 10v11" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

export function FeedbackButtons({ messageId }: { messageId: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [promoted, setPromoted] = useState(false);
  const [pending, setPending] = useState(false);

  function send(next: "up" | "down") {
    if (pending || vote === next) return;
    setPending(true);
    feedbackApi
      .vote(messageId, next)
      .then((r) => {
        setVote(next);
        setPromoted(Boolean(r.promoted));
      })
      .catch(() => undefined)
      .finally(() => setPending(false));
  }

  const base =
    "flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-50";

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
      <span>Was this right?</span>
      <button
        type="button"
        onClick={() => send("up")}
        disabled={pending}
        aria-label="Helpful"
        className={`${base} ${
          vote === "up"
            ? "border-accent bg-accent/10 text-accent"
            : "border-border text-subtle hover:border-accent hover:text-accent"
        }`}
      >
        <ThumbIcon />
      </button>
      <button
        type="button"
        onClick={() => send("down")}
        disabled={pending}
        aria-label="Not helpful"
        className={`${base} ${
          vote === "down"
            ? "border-red-300 bg-red-50 text-red-600"
            : "border-border text-subtle hover:border-red-300 hover:text-red-600"
        }`}
      >
        <ThumbIcon down />
      </button>
      {promoted ? (
        <span className="text-accent">Saved as an example</span>
      ) : null}
    </div>
  );
}
