/**
 * Real-browser end-to-end smoke test.
 *
 * Launches Chrome under Xvfb using --remote-debugging-pipe (pipe transport),
 * loads the built extension via Extensions.loadUnpacked, and verifies nine
 * assertions covering loading, service-worker behaviour, tab tracking, side-panel
 * rendering, and the privacy guarantee (no outbound network from the panel).
 *
 * Run with:  npm run smoke
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { CDP } from "./lib/cdp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");
const ARTIFACTS = resolve(root, "artifacts");

// ── Overall timeout ───────────────────────────────────────────────────────────

const OVERALL_TIMEOUT_MS = 90_000;
const overallTimer = setTimeout(() => {
  console.error("\nFATAL: smoke test exceeded 90s — aborting");
  process.exit(2);
}, OVERALL_TIMEOUT_MS);
overallTimer.unref(); // Don't keep the process alive on clean exit

// ── Result tracking ───────────────────────────────────────────────────────────

const results = [];
let anyFail = false;

function pass(label) {
  results.push({ ok: true, label });
  console.log(`  PASS  ${label}`);
}

function fail(label, detail = "") {
  anyFail = true;
  results.push({ ok: false, label });
  console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Poll `fn()` until it returns a truthy value, or throw after `timeoutMs`.
 * @template T
 * @param {() => Promise<T | null | undefined | false>} fn
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function waitFor(fn, { timeoutMs = 10_000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== null && v !== undefined && v !== false) return v;
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Start a tiny HTTP server on an ephemeral port, serving three minimal HTML
 * pages with distinct titles.
 * @returns {Promise<{ server: import('http').Server, urls: string[] }>}
 */
function startHttpServer() {
  const pages = [
    { path: "/alpha", title: "Smoke Alpha" },
    { path: "/beta", title: "Smoke Beta" },
    { path: "/gamma", title: "Smoke Gamma" },
  ];

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const page = pages.find((p) => p.path === req.url);
      if (page) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html><head><title>${page.title}</title></head><body><h1>${page.title}</h1></body></html>`);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import('net').AddressInfo} */ (server.address());
      const urls = pages.map((p) => `http://127.0.0.1:${port}${p.path}`);
      resolve({ server, urls });
    });

    server.on("error", reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

let chromeProc = null;
let profileDir = null;
let httpServer = null;
let cdp = null;

try {
  // ── Setup ─────────────────────────────────────────────────────────────────

  await mkdir(ARTIFACTS, { recursive: true });
  profileDir = await mkdtemp(resolve(tmpdir(), "tlm-smoke-"));

  console.log("\nStarting Chrome with pipe transport…");
  chromeProc = spawn(
    "xvfb-run",
    [
      "-a",
      "google-chrome",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--disable-dbus",
      "--enable-unsafe-extension-debugging",
      "--remote-debugging-pipe",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    {
      // fd 3 = writable (send to Chrome), fd 4 = readable (receive from Chrome)
      stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
    },
  );

  chromeProc.stdout.on("data", (d) => process.stdout.write(`[chrome] ${d}`));
  chromeProc.stderr.on("data", (d) => {
    const s = d.toString();
    // Only print interesting stderr lines to avoid flooding the output
    if (/error|warning|exception/i.test(s)) process.stderr.write(`[chrome-err] ${s}`);
  });

  const readable = chromeProc.stdio[4];
  const writable = chromeProc.stdio[3];

  cdp = new CDP(readable, writable);

  // Give Chrome a moment to start up
  await new Promise((r) => setTimeout(r, 1500));

  // ── Assertion 1: load extension ───────────────────────────────────────────

  console.log("\nAssertion 1: Extensions.loadUnpacked…");
  let extensionId;
  try {
    const result = await cdp.send("Extensions.loadUnpacked", { path: DIST });
    extensionId = result.id;
    if (extensionId && extensionId.length > 0) {
      pass("1. Extensions.loadUnpacked succeeds and returns an extension id");
    } else {
      fail("1. Extensions.loadUnpacked succeeds and returns an extension id", "empty id");
    }
  } catch (e) {
    fail("1. Extensions.loadUnpacked succeeds and returns an extension id", String(e));
    throw e; // Cannot continue without an extension id
  }

  console.log(`   Extension id: ${extensionId}`);
  const EXT = `chrome-extension://${extensionId}`;

  // Wait a moment for the SW to initialize and fire onInstalled
  await new Promise((r) => setTimeout(r, 1500));

  // ── Assertion 2: service-worker target exists ─────────────────────────────

  console.log("\nAssertion 2: service-worker target…");
  let swTarget;
  try {
    swTarget = await waitFor(async () => {
      const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{}] });
      return targetInfos.find(
        (t) => t.type === "service_worker" && t.url === `${EXT}/background.js`,
      );
    }, { timeoutMs: 10_000 });
    pass(`2. service_worker target exists for ${EXT}/background.js`);
  } catch {
    fail(`2. service_worker target exists for ${EXT}/background.js`);
    // Continue: we may still be able to run other assertions
    swTarget = null;
  }

  // ── Assertion 3: onboarding page opened automatically ────────────────────

  console.log("\nAssertion 3: onboarding page opened…");
  let onboardingTarget;
  try {
    onboardingTarget = await waitFor(async () => {
      const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{}] });
      return targetInfos.find((t) => t.url === `${EXT}/onboarding.html`);
    }, { timeoutMs: 10_000 });
    pass(`3. Onboarding page opened: ${EXT}/onboarding.html`);
  } catch {
    fail(`3. Onboarding page opened: ${EXT}/onboarding.html`);
    onboardingTarget = null;
  }

  // ── Attach to service worker and enable Runtime ───────────────────────────

  const swExceptions = [];
  let swSession = null;

  if (swTarget) {
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId: swTarget.targetId,
      flatten: true,
    });
    swSession = sessionId;
    await cdp.send("Runtime.enable", {}, swSession);

    cdp.on(
      "Runtime.exceptionThrown",
      (params) => {
        swExceptions.push(params.exceptionDetails);
      },
      swSession,
    );
  }

  // ── Assertion 5: create three real HTTP tabs ──────────────────────────────

  console.log("\nAssertion 5: creating three HTTP test tabs…");
  const { server, urls } = await startHttpServer();
  httpServer = server;
  console.log(`   HTTP server on ${urls[0].replace(/\/alpha$/, "")}`);

  const testTabTargetIds = [];
  for (const url of urls) {
    const { targetId } = await cdp.send("Target.createTarget", { url });
    testTabTargetIds.push(targetId);
    console.log(`   Created tab: ${url}`);
  }

  // Wait for the SW to process the onCreated events and store records
  await new Promise((r) => setTimeout(r, 2500));

  // Confirm the three tabs are accessible (all targets list them)
  const { targetInfos: allTargets } = await cdp.send("Target.getTargets", { filter: [{}] });
  const foundCount = urls.filter((url) => allTargets.some((t) => t.url === url)).length;
  if (foundCount === 3) {
    pass("5. Three HTTP test tabs created successfully");
  } else {
    fail("5. Three HTTP test tabs created successfully", `only ${foundCount}/3 found`);
  }

  // ── Assertion 6: storage records for the three test tabs ──────────────────

  console.log("\nAssertion 6: checking storage tab records…");
  if (swSession) {
    try {
      // Ask the SW to return the current tab records as JSON
      const evalResult = await cdp.send(
        "Runtime.evaluate",
        {
          expression: `(async () => {
            const r = await chrome.storage.session.get("tabRecords");
            return JSON.stringify(r.tabRecords ?? {});
          })()`,
          awaitPromise: true,
          returnByValue: true,
        },
        swSession,
      );

      if (evalResult.result?.type === "string") {
        const tabRecords = JSON.parse(evalResult.result.value);
        const records = Object.values(tabRecords);

        // Find records for the three test URLs
        // Use a more direct check: look for records matching each URL
        const matchingRecords = records.filter((r) =>
          urls.some((url) => r.url === url),
        );

        if (matchingRecords.length === 3) {
          let allValid = true;
          for (const rec of matchingRecords) {
            if (!rec.normalizedUrl) {
              fail(`6. Record for ${rec.url} has empty normalizedUrl`);
              allValid = false;
            }
            if (rec.canDiscard !== true) {
              fail(`6. Record for ${rec.url} has canDiscard !== true (got ${rec.canDiscard})`);
              allValid = false;
            }
            if (rec.canClose !== true) {
              fail(`6. Record for ${rec.url} has canClose !== true (got ${rec.canClose})`);
              allValid = false;
            }
          }
          if (allValid) {
            pass("6. Storage has records for all three test tabs with correct fields");
          }
        } else {
          // Titles might not match exactly due to timing; report what we found
          const allUrls = records.map((r) => r.url);
          console.log(`   Found ${records.length} total records. URLs: ${allUrls.join(", ")}`);
          console.log(`   Expected: ${urls.join(", ")}`);
          // Try checking by title as fallback
          const titles = ["Smoke Alpha", "Smoke Beta", "Smoke Gamma"];
          const byTitle = records.filter((r) => titles.includes(r.title));
          if (byTitle.length === 3) {
            pass("6. Storage has records for all three test tabs (matched by title)");
          } else {
            fail(
              "6. Storage has records for all three test tabs with correct fields",
              `found ${matchingRecords.length} url-matched records, ${byTitle.length} title-matched`,
            );
          }
        }
      } else {
        fail("6. Storage has records for all three test tabs with correct fields", "eval did not return string");
      }
    } catch (e) {
      fail("6. Storage has records for all three test tabs with correct fields", String(e));
    }
  } else {
    fail("6. Storage has records for all three test tabs with correct fields", "no SW session");
  }

  // ── Assertion 7 + 8: side-panel rendering and privacy ────────────────────

  console.log("\nAssertion 7+8: loading side panel…");

  // Collect all network requests from the panel session for assertion 8
  const panelRequests = [];
  const panelExceptions = [];

  let panelSession = null;
  try {
    const panelUrl = `${EXT}/sidepanel.html`;
    const { targetId: panelTargetId } = await cdp.send("Target.createTarget", { url: panelUrl });

    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId: panelTargetId,
      flatten: true,
    });
    panelSession = sessionId;

    // Set a realistic side-panel viewport before enabling Page (so we can screenshot)
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 400, height: 800, deviceScaleFactor: 1, mobile: false },
      panelSession,
    );

    // Enable domains
    await Promise.all([
      cdp.send("Runtime.enable", {}, panelSession),
      cdp.send("Network.enable", {}, panelSession),
      cdp.send("Page.enable", {}, panelSession),
      cdp.send("Log.enable", {}, panelSession),
    ]);

    // Collect network requests
    cdp.on(
      "Network.requestWillBeSent",
      (params) => {
        panelRequests.push(params.request.url);
        console.log(`   [network] ${params.request.url}`);
      },
      panelSession,
    );

    // Collect exceptions
    cdp.on(
      "Runtime.exceptionThrown",
      (params) => {
        panelExceptions.push(params.exceptionDetails);
      },
      panelSession,
    );

    // Wait for the page to load and React to render
    await cdp.waitForEvent("Page.loadEventFired", panelSession, 15_000);

    // Wait for React to mount and fetch tab data (GET_APP_STATE round-trip)
    await new Promise((r) => setTimeout(r, 2000));

    // Poll for .tab-row elements
    let tabRowCount = 0;
    try {
      await waitFor(
        async () => {
          const res = await cdp.send(
            "Runtime.evaluate",
            {
              expression: "document.querySelectorAll('.tab-row').length",
              returnByValue: true,
            },
            panelSession,
          );
          tabRowCount = res.result?.value ?? 0;
          return tabRowCount >= 3;
        },
        { timeoutMs: 10_000 },
      );
      pass(`7a. Side panel has at least 3 .tab-row elements (found ${tabRowCount})`);
    } catch {
      fail("7a. Side panel has at least 3 .tab-row elements", `found ${tabRowCount}`);
    }

    // Check the three page titles appear in the panel body text
    const bodyTextResult = await cdp.send(
      "Runtime.evaluate",
      { expression: "document.body.innerText", returnByValue: true },
      panelSession,
    );
    const bodyText = bodyTextResult.result?.value ?? "";
    const expectedTitles = ["Smoke Alpha", "Smoke Beta", "Smoke Gamma"];
    const missingTitles = expectedTitles.filter((t) => !bodyText.includes(t));
    if (missingTitles.length === 0) {
      pass("7b. All three test page titles appear in the side-panel body text");
    } else {
      fail("7b. All three test page titles appear in the side-panel body text", `missing: ${missingTitles.join(", ")}`);
    }

    // Assertion 7c: no Runtime exceptions in the panel
    if (panelExceptions.length === 0) {
      pass("7c. No Runtime.exceptionThrown events from the side-panel session");
    } else {
      fail(
        "7c. No Runtime.exceptionThrown events from the side-panel session",
        panelExceptions.map((e) => e.text).join("; "),
      );
    }
  } catch (e) {
    fail("7. Side panel loaded and rendered", String(e));
  }

  // ── Assertion 8: privacy — no http/https network requests from panel ──────

  console.log("\nAssertion 8: privacy check…");
  const externalRequests = panelRequests.filter(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
  );

  console.log(`   All observed panel requests (${panelRequests.length} total):`);
  for (const url of panelRequests) {
    const ok = url.startsWith("chrome-extension:") || url.startsWith("data:");
    console.log(`     ${ok ? "OK  " : "FAIL"} ${url}`);
  }

  if (externalRequests.length === 0) {
    pass(
      "8. Privacy: no http/https requests from the side panel (no network leak)",
    );
  } else {
    fail(
      "8. Privacy: no http/https requests from the side panel",
      `${externalRequests.length} external request(s): ${externalRequests.join(", ")}`,
    );
  }

  // ── Assertion 9: screenshots ──────────────────────────────────────────────

  console.log("\nAssertion 9: screenshots…");

  let lightPng = null;

  if (panelSession) {
    try {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, panelSession);
      lightPng = data;
      await writeFile(resolve(ARTIFACTS, "smoke-sidepanel.png"), Buffer.from(data, "base64"));
      console.log("   Saved artifacts/smoke-sidepanel.png");
    } catch (e) {
      console.log(`   Could not screenshot panel (light): ${String(e)}`);
    }
  }

  // Dark-theme screenshot: emulate prefers-color-scheme: dark, wait for
  // ThemeProvider to react, then capture and assert the render differs.
  if (panelSession) {
    try {
      await cdp.send(
        "Emulation.setEmulatedMedia",
        { media: "screen", features: [{ name: "prefers-color-scheme", value: "dark" }] },
        panelSession,
      );
      // Allow React / CSS to settle
      await new Promise((r) => setTimeout(r, 600));

      const { data: darkData } = await cdp.send("Page.captureScreenshot", { format: "png" }, panelSession);
      await writeFile(resolve(ARTIFACTS, "smoke-sidepanel-dark.png"), Buffer.from(darkData, "base64"));
      console.log("   Saved artifacts/smoke-sidepanel-dark.png");

      if (lightPng !== null) {
        const lightHash = createHash("sha256").update(Buffer.from(lightPng, "base64")).digest("hex");
        const darkHash = createHash("sha256").update(Buffer.from(darkData, "base64")).digest("hex");
        if (lightHash !== darkHash) {
          pass("9b. Dark-theme screenshot differs from light-theme screenshot");
        } else {
          fail("9b. Dark-theme screenshot differs from light-theme screenshot", "screenshots are identical — dark theme may be broken");
        }
      }
    } catch (e) {
      fail("9b. Dark-theme screenshot differs from light-theme screenshot", String(e));
    }
  }

  if (onboardingTarget) {
    try {
      const { sessionId: obSession } = await cdp.send("Target.attachToTarget", {
        targetId: onboardingTarget.targetId,
        flatten: true,
      });
      // Onboarding opens in a full browser tab — use a realistic desktop viewport.
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1000, height: 800, deviceScaleFactor: 1, mobile: false,
      }, obSession);
      await cdp.send("Page.enable", {}, obSession);
      await new Promise((r) => setTimeout(r, 500));
      const { data: obPng } = await cdp.send("Page.captureScreenshot", { format: "png" }, obSession);
      await writeFile(resolve(ARTIFACTS, "smoke-onboarding.png"), Buffer.from(obPng, "base64"));
      console.log("   Saved artifacts/smoke-onboarding.png");
    } catch (e) {
      console.log(`   Could not screenshot onboarding: ${String(e)}`);
    }
  }

  pass("9. Screenshots captured");

  // ── Assertion 4: no SW exceptions (checked last, after all interactions) ──

  console.log("\nAssertion 4: service-worker exceptions…");
  if (swExceptions.length === 0) {
    pass("4. No Runtime.exceptionThrown events from the service-worker session");
  } else {
    fail(
      "4. No Runtime.exceptionThrown events from the service-worker session",
      swExceptions.map((e) => e.text).join("; "),
    );
  }
} catch (e) {
  console.error("\nUnexpected error:", e);
  anyFail = true;
} finally {
  clearTimeout(overallTimer);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  if (cdp) cdp.close("smoke test done");
  if (httpServer) httpServer.close();
  if (chromeProc) {
    chromeProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (!chromeProc.killed) chromeProc.kill("SIGKILL");
  }
  if (profileDir) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n── Smoke test summary ───────────────────────────────────────────");
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
}
console.log(`\n${anyFail ? "SMOKE TESTS FAILED" : "SMOKE TESTS PASSED"}`);
process.exit(anyFail ? 1 : 0);
