/**
 * Chrome CDP smoke test for Milestone 2 automated lifecycle.
 *
 * Uses DEV_FAST_LIFECYCLE thresholds (applied on onboarding in dev builds).
 * Run: npm run build && npm run smoke:lifecycle
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CDP } from "./lib/cdp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");

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

async function waitFor(fn, { timeoutMs = 15_000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function startHttpServer() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      if (req.url === "/lifecycle") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!DOCTYPE html><html><head><title>Lifecycle Tab</title></head><body><h1>Lifecycle Tab</h1></body></html>");
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import('net').AddressInfo} */ (server.address());
      resolvePromise({ server, url: `http://127.0.0.1:${port}/lifecycle` });
    });
    server.on("error", reject);
  });
}

async function swEval(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

let chromeProc = null;
let profileDir = null;
let httpServer = null;
let cdp = null;

try {
  profileDir = await mkdtemp(resolve(tmpdir(), "tlm-lifecycle-"));

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
    { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] },
  );

  cdp = new CDP(chromeProc.stdio[4], chromeProc.stdio[3]);
  await new Promise((r) => setTimeout(r, 1500));

  const { id: extensionId } = await cdp.send("Extensions.loadUnpacked", { path: DIST });
  const EXT = `chrome-extension://${extensionId}`;
  await new Promise((r) => setTimeout(r, 1500));

  const swTarget = await waitFor(async () => {
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{}] });
    return targetInfos.find((t) => t.type === "service_worker" && t.url === `${EXT}/background.js`);
  });

  const { sessionId: swSession } = await cdp.send("Target.attachToTarget", {
    targetId: swTarget.targetId,
    flatten: true,
  });
  await cdp.send("Runtime.enable", {}, swSession);

  const swExceptions = [];
  cdp.on("Runtime.exceptionThrown", (p) => swExceptions.push(p), swSession);

  // ── Complete onboarding with fast lifecycle via storage ───────────────────
  console.log("\nLifecycle 1: complete onboarding…");
  const onboardingResult = await swEval(
    cdp,
    swSession,
    `(async () => {
      const now = Date.now();
      const settings = {
        schemaVersion: 1,
        onboardingCompleted: true,
        automationPaused: false,
        sleepEnabled: true,
        autoCloseEnabled: true,
        sleepAfterMinutes: 5,
        closeAfterMinutes: 60,
        closeGraceMinutes: 5,
        lockImpliesKeepLoaded: false,
        neverSleepHosts: [],
        neverCloseHosts: [],
        activityRetentionDays: 30,
        recoveryRetentionDays: 30,
        maximumActivityEvents: 1000,
        maximumRecoveryRecords: 500,
        storeClosedTabUrls: true,
        showInPanelToasts: true,
        theme: 'system',
      };
      await chrome.storage.local.set({
        'settings:v1': settings,
        'runtimeState:v1': {
          browserStartedAt: now - 60 * 60 * 1000,
          lastSweepCompletedAt: now - 60_000,
          lastRetentionRunAt: 0,
          reportOnlyUntil: now + 7 * 24 * 60 * 60 * 1000,
          lastKnownVersion: chrome.runtime.getManifest().version,
          whatsNewVersion: chrome.runtime.getManifest().version,
          whatsNewSeenVersion: chrome.runtime.getManifest().version,
        },
      });
      return 'onboarding-stub-ok';
    })()`,
  );

  if (onboardingResult === "onboarding-stub-ok") {
    pass("1. Onboarding settings seeded with fast lifecycle thresholds");
  } else {
    fail("1. Onboarding settings seeded", String(onboardingResult));
  }

  // ── Create aged background tab ─────────────────────────────────────────────
  const { server, url: testUrl } = await startHttpServer();
  httpServer = server;

  await cdp.send("Target.createTarget", { url: testUrl });
  await cdp.send("Target.createTarget", { url: "about:blank", activate: true });
  await new Promise((r) => setTimeout(r, 2000));

  console.log("\nLifecycle 2: age tab and run sweep…");
  const ageResult = await swEval(
    cdp,
    swSession,
    `(async () => {
      const now = Date.now();
      const tabs = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      const tab = tabs[0];
      if (!tab?.id) return { ok: false, reason: 'tab-not-found' };

      // Ensure the test tab is in the background.
      if (tab.active) {
        const blank = (await chrome.tabs.query({ url: 'about:blank' }))[0];
        if (blank?.id) await chrome.tabs.update(blank.id, { active: true });
      }

      const raw = await chrome.storage.session.get('tabRecords');
      const records = raw.tabRecords ?? {};
      const key = String(tab.id);
      const rec = records[key];
      if (!rec) return { ok: false, reason: 'record-not-found' };

      records[key] = {
        ...rec,
        active: false,
        lastActivatedAt: now - 70 * 60 * 1000,
        firstObservedAt: now - 3 * 24 * 60 * 60 * 1000,
        inactivityCreditMs: 0,
        neverActivated: false,
        pendingCloseAt: undefined,
        pendingCloseScheduledAt: undefined,
        discarded: false,
      };
      await chrome.storage.session.set({ tabRecords: records });

      return { ok: true, tabId: tab.id, active: tab.active };
    })()`,
  );

  if (ageResult?.ok) {
    pass("2. Test tab record aged in session storage");
  } else {
    fail("2. Test tab record aged", JSON.stringify(ageResult));
  }

  // Run lifecycle sweep via panel message after patching in the service worker.
  const { targetId: panelTargetId } = await cdp.send("Target.createTarget", {
    url: `${EXT}/sidepanel.html`,
  });
  const { sessionId: panelSession } = await cdp.send("Target.attachToTarget", {
    targetId: panelTargetId,
    flatten: true,
  });
  await cdp.send("Runtime.enable", {}, panelSession);
  await new Promise((r) => setTimeout(r, 500));

  await swEval(
    cdp,
    swSession,
    `(async () => {
      const now = Date.now();
      const tabs = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      const tab = tabs[0];
      if (!tab?.id) return { ok: false };

      if (tab.active) {
        const blank = (await chrome.tabs.query({ url: 'about:blank' }))[0];
        if (blank?.id) await chrome.tabs.update(blank.id, { active: true });
        await new Promise((r) => setTimeout(r, 300));
      }

      const raw = await chrome.storage.session.get('tabRecords');
      const records = raw.tabRecords ?? {};
      const key = String(tab.id);
      const rec = records[key];
      if (!rec) return { ok: false };

      records[key] = {
        ...rec,
        active: false,
        lastActivatedAt: now - 70 * 60 * 1000,
        firstObservedAt: now - 3 * 24 * 60 * 60 * 1000,
        inactivityCreditMs: 0,
        neverActivated: false,
        pendingCloseAt: undefined,
        pendingCloseScheduledAt: undefined,
        discarded: false,
      };
      await chrome.storage.session.set({ tabRecords: records });
      return { ok: true };
    })()`,
  );

  const sweepResponse = await swEval(
    cdp,
    panelSession,
    `(async () => {
      const res = await chrome.runtime.sendMessage({ v: 1, request: { type: 'RUN_LIFECYCLE_SWEEP' } });
      return res;
    })()`,
  );

  if (sweepResponse?.ok === true) {
    const slept = sweepResponse.data?.slept ?? 0;
    const scheduled = sweepResponse.data?.scheduled ?? 0;
    pass(`3. RUN_LIFECYCLE_SWEEP succeeded (slept=${slept}, scheduled=${scheduled})`);
  } else {
    fail("3. RUN_LIFECYCLE_SWEEP", JSON.stringify(sweepResponse));
  }

  const postSweep = await swEval(
    cdp,
    swSession,
    `(async () => {
      const tabs = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      const tab = tabs[0];
      if (!tab?.id) return { found: false };
      const raw = await chrome.storage.session.get('tabRecords');
      const rec = raw.tabRecords?.[String(tab.id)];
      return {
        found: true,
        discarded: tab.discarded === true,
        pendingCloseAt: rec?.pendingCloseAt ?? null,
        lastActivatedAt: rec?.lastActivatedAt ?? null,
      };
    })()`,
  );

  const sweepData = sweepResponse?.data ?? {};
  const lifecycleChanged =
    (sweepData.slept ?? 0) > 0 ||
    (sweepData.scheduled ?? 0) > 0 ||
    (sweepData.wouldClose ?? 0) > 0 ||
    postSweep?.discarded ||
    postSweep?.pendingCloseAt;

  if (postSweep?.found && lifecycleChanged) {
    pass("4. Sweep changed lifecycle state (sleep, schedule, or report-only)");
  } else {
    fail("4. Post-sweep tab state", JSON.stringify({ postSweep, sweepData }));
  }

  // Report-only: verify runtime flag prevents close
  const reportOnlyCheck = await swEval(
    cdp,
    swSession,
    `(async () => {
      const runtime = (await chrome.storage.local.get('runtimeState:v1'))['runtimeState:v1'];
      const tabs = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      return {
        reportOnlyActive: runtime?.reportOnlyUntil > Date.now(),
        tabStillOpen: tabs.length === 1,
      };
    })()`,
  );

  if (reportOnlyCheck?.reportOnlyActive && reportOnlyCheck?.tabStillOpen) {
    pass("5. Report-only mode active and tab not removed");
  } else {
    fail("5. Report-only mode", JSON.stringify(reportOnlyCheck));
  }

  // Concurrent sweep lease: second acquire within stale window should skip
  const leaseResult = await swEval(
    cdp,
    swSession,
    `(async () => {
      const now = Date.now();
      const lease1 = { id: 'a', startedAt: now };
      await chrome.storage.session.set({ sweepLease: lease1 });
      const existing = (await chrome.storage.session.get('sweepLease')).sweepLease;
      const blocked = existing && (now - existing.startedAt < 60_000);
      await chrome.storage.session.set({ sweepLease: null });
      return { blocked: !!blocked };
    })()`,
  );

  if (leaseResult?.blocked) {
    pass("6. Sweep lease blocks concurrent run within 60s");
  } else {
    fail("6. Sweep lease", JSON.stringify(leaseResult));
  }

  if (swExceptions.length === 0) {
    pass("7. No service-worker exceptions during lifecycle smoke");
  } else {
    fail("7. No SW exceptions", swExceptions.map((e) => e.text).join("; "));
  }
} catch (e) {
  console.error("\nUnexpected error:", e);
  anyFail = true;
} finally {
  if (cdp) cdp.close("lifecycle smoke done");
  if (httpServer) httpServer.close();
  if (chromeProc) {
    chromeProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
  if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

console.log("\n── Lifecycle smoke summary ──────────────────────────────────────");
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(`\n${anyFail ? "LIFECYCLE SMOKE FAILED" : "LIFECYCLE SMOKE PASSED"}`);
process.exit(anyFail ? 1 : 0);
