import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-light tracking-tight">Sift</h1>
          <p className="mt-2 text-sm text-subtle">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-7 shadow-sm">
          <h2 className="mb-5 text-lg font-medium">{title}</h2>
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  );
}
