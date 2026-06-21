"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { user, hydrated, guest } = useAuth();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (hydrated && user) router.replace("/app");
  }, [hydrated, user, router]);

  async function tryGuest() {
    setPending(true);
    try {
      await guest();
      router.push("/app");
    } catch {
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex max-w-xl flex-col items-center gap-7">
        <h1 className="text-7xl font-light tracking-tight sm:text-8xl">Sift</h1>
        <p className="max-w-md text-lg leading-8 text-muted">
          Ask your database anything in plain English. Sift writes the SQL, runs
          it safely, and shows you the chart — plus the exact query behind it.
        </p>
        <div className="h-px w-16 bg-accent/60" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => router.push("/login")}>Sign in</Button>
          <Button variant="outline" onClick={() => router.push("/register")}>
            Create account
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => void tryGuest()}
          >
            {pending ? "Starting…" : "Try the demo"}
          </Button>
        </div>
      </div>
    </main>
  );
}
