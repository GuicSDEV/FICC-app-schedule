import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import QRCode from "qrcode";

import { addDays, apiAs, getJson } from "./support";

const ROOT = path.join(__dirname, "../../..");
const ARTIFACTS = path.join(__dirname, ".artifacts");

/** A tiny Y4M video (what Chromium's fake camera plays) showing a QR code on white. */
function qrVideo(text: string): Buffer {
  const width = 640;
  const height = 480;
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const scale = Math.floor(400 / (modules.size + quiet * 2));
  const side = (modules.size + quiet * 2) * scale;
  const left = Math.floor((width - side) / 2);
  const top = Math.floor((height - side) / 2);
  const luma = Buffer.alloc(width * height, 235);
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      for (let y = 0; y < scale; y++) {
        const offset = (top + (row + quiet) * scale + y) * width + left + (col + quiet) * scale;
        luma.fill(16, offset, offset + scale);
      }
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  return Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]);
}

export default async function globalSetup(): Promise<void> {
  if (!process.env.E2E_SKIP_SEED) {
    execSync("pnpm db:seed", { cwd: ROOT, stdio: "inherit" });
  }
  // Predictable calendar for the journeys: every day of the window is a booking day and opens at
  // once (the seed's FICC rules open each day at 07:00 the day before and make Saturday free play).
  // A running API caches the club for 30 s: retry until it serves the freshly seeded one.
  const deadline = Date.now() + 45_000;
  let admin = null;
  while (!admin) {
    try {
      const candidate = await apiAs({ email: "admin@ficc.test" });
      const settings = await candidate.patch("admin/settings", {
        data: { bookingOpening: null, dayModes: {} },
      });
      if (settings.ok()) admin = candidate;
      else await candidate.dispose();
    } catch {
      // Login fails while the cached club is the old one.
    }
    if (!admin) {
      if (Date.now() > deadline) throw new Error("the API did not pick up the seeded club");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Guest pass for today, filmed by the gate's fake camera in gate.spec.ts.
  const host = await apiAs({ member: "110452" });
  const { today } = await getJson<{ today: string }>(host, "courts");
  const pass = await host.post("guest-passes", {
    data: {
      guestName: "Joana Prado",
      documentType: "CPF",
      documentNumber: "52998224725",
      visitDate: today,
    },
  });
  if (!pass.ok()) throw new Error(`guest pass: ${pass.status()} ${await pass.text()}`);
  const { token } = (await pass.json()) as { token: string };
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(path.join(ARTIFACTS, "guest-pass.y4m"), qrVideo(token));
  writeFileSync(
    path.join(ARTIFACTS, "dates.json"),
    JSON.stringify({ today, inTwoDays: addDays(today, 2) }),
  );
  await Promise.all([admin.dispose(), host.dispose()]);
}
