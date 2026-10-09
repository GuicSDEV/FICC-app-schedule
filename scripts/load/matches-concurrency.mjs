#!/usr/bin/env node
// Concurrency test for match reports: many members log in, report singles/doubles matches at the
// same time, and opponents approve them at the same time (Elo updates, one at a time per club).
//
//   API_URL=http://localhost:4000/api/v1 PASSWORD=... MEMBERS=104218,104377,... node scripts/load/matches-concurrency.mjs
//
// Optional: MATCHES (default 20), DOUBLES_RATIO (default 0.3).

const API = (process.env.API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
const PASSWORD = process.env.PASSWORD;
const MEMBERS = (process.env.MEMBERS ?? "").split(",").filter(Boolean);
const MATCHES = Number(process.env.MATCHES ?? 20);
const DOUBLES_RATIO = Number(process.env.DOUBLES_RATIO ?? 0.3);

if (!PASSWORD || MEMBERS.length < 4) {
  console.error("Set PASSWORD and MEMBERS (at least 4 membership ids, comma separated).");
  process.exit(1);
}

async function call(session, method, path, body) {
  const started = performance.now();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(session?.cookie ? { cookie: session.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - started;
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json, ms, headers: response.headers };
}

async function login(membershipId) {
  const res = await call(null, "POST", "/auth/login", {
    kind: "member",
    membershipId,
    password: PASSWORD,
  });
  if (res.status !== 200)
    throw new Error(`login ${membershipId}: ${res.status} ${JSON.stringify(res.json)}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: res.json.id, name: res.json.name, membershipId, cookie };
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomScore() {
  const sets = [];
  let a = 0;
  let b = 0;
  while (a < 2 && b < 2) {
    const aWins = Math.random() < 0.5;
    const loser = Math.floor(Math.random() * 5);
    sets.push(aWins ? { a: 6, b: loser } : { a: loser, b: 6 });
    if (aWins) a += 1;
    else b += 1;
  }
  return sets;
}

function today() {
  // Club zone (FICC: America/Sao_Paulo); yesterday avoids MATCH_IN_FUTURE near midnight.
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

function summarize(label, results) {
  const byStatus = {};
  for (const r of results) {
    const key = r.status === 0 ? "network" : `${r.status}${r.code ? ` ${r.code}` : ""}`;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  const times = results.map((r) => r.ms).sort((x, y) => x - y);
  const pct = (p) =>
    Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0);
  console.log(
    `${label}: ${results.length} requests | ${JSON.stringify(byStatus)} | p50 ${pct(0.5)}ms p95 ${pct(0.95)}ms max ${pct(1)}ms`,
  );
}

const errorCode = (json) =>
  json && typeof json === "object" ? (json.code ?? json.error?.code) : undefined;

async function main() {
  console.log(`API ${API} — ${MEMBERS.length} members, ${MATCHES} matches`);

  const sessions = await Promise.all(MEMBERS.map(login));
  console.log(`logged in: ${sessions.map((s) => s.name).join(", ")}`);
  const ratingsBefore = await ratings(sessions[0]);

  // 1. Every report is sent at the same instant.
  const plans = Array.from({ length: MATCHES }, () => {
    const doubles = Math.random() < DOUBLES_RATIO;
    const picked = shuffle(sessions).slice(0, doubles ? 4 : 2);
    const half = picked.length / 2;
    return {
      format: doubles ? "DOUBLES" : "SINGLES",
      sideA: picked.slice(0, half),
      sideB: picked.slice(half),
      score: randomScore(),
    };
  });
  const reports = await Promise.all(
    plans.map(async (plan) => {
      const reporter = plan.sideA[0];
      const res = await call(reporter, "POST", "/matches", {
        format: plan.format,
        sideA: plan.sideA.map((s) => s.id),
        sideB: plan.sideB.map((s) => s.id),
        score: plan.score,
        playedOn: today(),
        surface: "SAIBRO",
      }).catch((error) => ({ status: 0, json: String(error), ms: 0 }));
      return { ...res, code: errorCode(res.json), plan };
    }),
  );
  summarize("report", reports);
  for (const r of reports.filter((x) => x.status >= 300))
    console.log("  report error:", r.status, JSON.stringify(r.json));

  // 2. Each opponent approves at the same instant (all matches at once).
  const created = reports.filter((r) => r.status === 201 || r.status === 200);
  const approvals = await Promise.all(
    created.map(async (r) => {
      const approver = r.plan.sideB[0];
      const res = await call(approver, "POST", `/matches/${r.json.id}/approve`).catch((error) => ({
        status: 0,
        json: String(error),
        ms: 0,
      }));
      return { ...res, code: errorCode(res.json), matchId: r.json.id, plan: r.plan };
    }),
  );
  summarize("approve", approvals);
  for (const r of approvals.filter((x) => x.status >= 300))
    console.log("  approve error:", r.status, JSON.stringify(r.json));

  // 3. Race: the same match approved twice at once must confirm exactly once.
  const extra = await call(plans[0].sideA[0], "POST", "/matches", {
    format: "SINGLES",
    sideA: [plans[0].sideA[0].id],
    sideB: [plans[0].sideB[0].id],
    score: randomScore(),
    playedOn: today(),
    surface: "SAIBRO",
  });
  if (extra.status < 300) {
    const twice = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(plans[0].sideB[0], "POST", `/matches/${extra.json.id}/approve`),
      ),
    );
    const ok = twice.filter((r) => r.status === 200).length;
    console.log(
      `double approve: ${ok} ok, others ${JSON.stringify(twice.filter((r) => r.status !== 200).map((r) => `${r.status} ${errorCode(r.json) ?? ""}`))}` +
        (ok === 1 ? " ✓" : " ✗ expected exactly 1"),
    );
    if (ok === 1) approvals.push({ ...twice.find((r) => r.status === 200), plan: null });
  }

  // 4. No lost updates: each player's Elo change must equal the sum of their deltas.
  const ratingsAfter = await ratings(sessions[0]);
  const confirmed = approvals.filter((a) => a.status === 200);
  const expected = new Map();
  for (const a of confirmed) {
    for (const p of a.json.players ?? []) {
      if (typeof p.delta === "number")
        expected.set(p.user.id, (expected.get(p.user.id) ?? 0) + p.delta);
    }
  }
  let mismatches = 0;
  for (const s of sessions) {
    const actual = (ratingsAfter.get(s.id) ?? 0) - (ratingsBefore.get(s.id) ?? 0);
    const want = expected.get(s.id) ?? 0;
    if (want !== actual) {
      mismatches += 1;
      console.log(`  ELO MISMATCH ${s.name}: rating moved ${actual}, sum of deltas ${want}`);
    }
  }
  console.log(
    `consistency: ${confirmed.length} confirmed, ${mismatches} player(s) with lost/extra Elo` +
      (mismatches === 0 ? " ✓" : " ✗"),
  );
}

async function ratings(session) {
  const res = await call(session, "GET", "/leaderboard");
  const map = new Map();
  for (const entry of res.json?.entries ?? []) map.set(entry.player.id, entry.elo);
  return map;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
