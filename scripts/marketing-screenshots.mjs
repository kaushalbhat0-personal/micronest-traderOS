/**
 * Reproducible marketing screenshot generation (UI-6B).
 *
 * Flow: production build -> local production server -> readiness poll ->
 * Playwright marketing capture -> asset verification -> server shutdown.
 * No credentials, no production traffic, no external data. Any single
 * failure aborts with a non-zero exit; partial assets never pass silently.
 */
import { spawn, spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";

const PORT = process.env.MKT_PORT ?? "3100";
const BASE_URL = process.env.MKT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const TOOLS = ["risk-guard", "trade-plan", "trade-cost", "strike-lens", "greek-map"];

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`command failed: ${command} ${args.join(" ")} (exit ${result.status})`);
  }
}

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`production server did not become ready at ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net
      .connect({ host: "127.0.0.1", port: Number(port) })
      .once("connect", () => probe.destroy(resolve(false)))
      .once("error", () => resolve(true));
    probe.setTimeout(2000, () => probe.destroy(resolve(true)));
  });
}

function stopServer(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    // child.kill() only stops the direct child; tree-kill the process group.
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function main() {
  if (!(await isPortFree(PORT))) {
    throw new Error(
      `port ${PORT} is already in use — stop the stale server first ` +
        `(a racing server can serve unstyled mid-rebuild output and poison capture).`,
    );
  }

  console.log("[screenshots] building production bundle…");
  run("pnpm", ["build"]);

  // Spawn the Next binary directly (not via a pnpm shell wrapper) so the
  // handle below refers to the real server and shutdown is reliable.
  const nextBin = createRequire(`${process.cwd()}/package.json`).resolve("next/dist/bin/next");
  console.log(`[screenshots] starting production server on :${PORT}…`);
  const server = spawn(process.execPath, [nextBin, "start", "-p", PORT], { stdio: "inherit" });
  let exitCode = 0;
  try {
    await waitForServer(`${BASE_URL}/`);
    console.log("[screenshots] server ready, capturing…");
    run("pnpm", ["exec", "playwright", "test", "--config", "playwright.marketing.config.ts"], {
      MKT_BASE_URL: BASE_URL,
    });

    console.log("[screenshots] verifying assets…");
    for (const tool of TOOLS) {
      const path = `public/product/${tool}.webp`;
      const info = await stat(path).catch(() => {
        throw new Error(`missing asset: ${path}`);
      });
      if (Date.now() - info.mtimeMs > 15 * 60 * 1000) {
        throw new Error(`stale asset (older than this run): ${path}`);
      }
      console.log(`[screenshots] ok ${path} (${Math.round(info.size / 1024)} KB)`);
    }
    console.log("[screenshots] all five marketing assets generated.");
  } catch (error) {
    exitCode = 1;
    throw error;
  } finally {
    stopServer(server);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`[screenshots] FAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
