// Cross-platform e2e runner (Windows PowerShell + Linux).
// 1) starts `vite preview` on 127.0.0.1:4173 serving the existing dist/
// 2) waits until it answers, 3) runs test/e2e.cjs, 4) stops the server.
// It does NOT build. Run `npm run build` first (npm run check does).
// One-time setup on a new machine: `npx playwright install chromium`.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;

if (!existsSync("dist/index.html")) {
  console.error("run-e2e: dist/index.html not found. Run `npm run build` first.");
  process.exit(2);
}

const shotDir = resolve(process.env.SHOT_DIR || "test-results/e2e-shots");
mkdirSync(shotDir, { recursive: true });

// vite does not export its bin path, so locate it next to its package.json.
// Refuse to run against some other server that already holds the port;
// otherwise the suite would silently test a stale build.
let portBusy = false;
try {
  await fetch(BASE);
  portBusy = true;
} catch {
  /* port is free */
}
if (portBusy) {
  console.error(`run-e2e: something is already listening on ${BASE}. Stop it (for example an old "vite preview") and retry.`);
  process.exit(2);
}

const viteBin = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
let serverExited = false;
server.on("exit", () => (serverExited = true));

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverExited) return false;
    try {
      const r = await fetch(BASE);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function stop() {
  if (!server.killed) server.kill();
}
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

const up = await waitForServer();
if (!up) {
  console.error("run-e2e: vite preview did not start on port " + PORT + ".\n" + serverLog);
  stop();
  process.exit(2);
}

let pwModule = process.env.PW_MODULE;
if (!pwModule) {
  try {
    pwModule = require.resolve("playwright");
  } catch {
    console.error("run-e2e: the `playwright` package is not installed. Run `npm ci`.");
    stop();
    process.exit(2);
  }
}

const child = spawn(process.execPath, ["test/e2e.cjs"], {
  stdio: "inherit",
  env: { ...process.env, PW_MODULE: pwModule, SHOT_DIR: shotDir, E2E_BASE: BASE },
});
child.on("exit", (code) => {
  stop();
  process.exit(code ?? 1);
});
