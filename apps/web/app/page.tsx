import { CLUB_TIMEZONE } from "@ficc/shared";

import { Button } from "@/components/ui/button";

// Phase 0 placeholder: confirms the web → API → database wiring.
// Replaced by the real member area in the screens phase.

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ApiHealth {
  status: "ok";
  database: "up" | "down";
  timezone: string;
}

async function getApiHealth(): Promise<ApiHealth | null> {
  try {
    const response = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as ApiHealth) : null;
  } catch {
    return null;
  }
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono text-sm tabular-nums">
        <span
          aria-hidden
          className={ok ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-red-500"}
        />
        {value}
      </span>
    </li>
  );
}

export default async function HomePage() {
  const health = await getApiHealth();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Phase 0 · monorepo scaffold</p>
        <h1 className="text-3xl font-semibold tracking-tight">FICC Tennis Club</h1>
      </header>

      <ul className="divide-y divide-border rounded-lg border px-4">
        <StatusRow label="Web" value="running" ok />
        <StatusRow label="API" value={health ? "up" : "unreachable"} ok={health !== null} />
        <StatusRow
          label="Database"
          value={health?.database ?? "unknown"}
          ok={health?.database === "up"}
        />
        <StatusRow label="Time zone" value={CLUB_TIMEZONE} ok />
      </ul>

      <Button asChild variant="outline" className="self-start">
        <a href={`${API_URL}/api/health`} target="_blank" rel="noreferrer">
          Open API health check
        </a>
      </Button>
    </main>
  );
}
