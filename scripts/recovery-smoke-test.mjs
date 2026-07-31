/**
 * Chrome CDP smoke test for Milestone 3 recovery flow.
 *
 * Run: npm run build && npm run smoke:recovery
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

async function waitFor(fn, { timeoutMs = 20_000, intervalMs = 300 } = {}) {
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
      if (req.url === "/recovery") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!DOCTYPE html><html><head><title>Recovery Tab</title></head><body><h1>Recovery Tab</h1></body></html>");
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import('net').AddressInfo} */ (server.address());
      resolvePromise({ server, url: `http://127.0.0.1:${port}/recovery` });
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
  profileDir = await mkdtemp(resolve(tmpdir(), "tlm-recovery-"));

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

  const { server, url: testUrl } = await startHttpServer();
  httpServer = server;

  console.log("\nRecovery 1: seed settings and open test tab…");
  await swEval(
    cdp,
    swSession,
    `(async () => {
      const now = Date.now();
      const version = chrome.runtime.getManifest().version;
      await chrome.storage.local.set({
        'settings:v1': {
          schemaVersion: 1,
          onboardingCompleted: true,
          automationPaused: false,
          sleepEnabled: false,
          autoCloseEnabled: true,
          sleepAfterMinutes: 60,
          closeAfterMinutes: 60,
          closeGraceMinutes: 1,
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
        },
        'runtimeState:v1': {
          browserStartedAt: now - 2 * 60 * 60 * 1000,
          lastSweepCompletedAt: now - 60_000,
          lastRetentionRunAt: 0,
          reportOnlyUntil: 0,
          lastKnownVersion: version,
          whatsNewVersion: version,
          whatsNewSeenVersion: version,
        },
        'recoveryRecords:v1': [],
      });
      return 'seed-ok';
    })()`,
  );

  await cdp.send("Target.createTarget", { url: testUrl });
  await cdp.send("Target.createTarget", { url: "about:blank", activate: true });
  await new Promise((r) => setTimeout(r, 2000));

  const { targetId: panelTargetId } = await cdp.send("Target.createTarget", {
    url: `${EXT}/sidepanel.html`,
  });
  const { sessionId: panelSession } = await cdp.send("Target.attachToTarget", {
    targetId: panelTargetId,
    flatten: true,
  });
  await cdp.send("Runtime.enable", {}, panelSession);
  await new Promise((r) => setTimeout(r, 500));

  pass("1. Settings seeded and test tab opened");

  console.log("\nRecovery 2: age tab and close via sweep…");
  const closeResult = await swEval(
    cdp,
    swSession,
    `(async () => {
      const now = Date.now();
      const tabs = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      const tab = tabs[0];
      if (!tab?.id) return { ok: false, reason: 'tab-not-found' };

      const blank = (await chrome.tabs.query({ url: 'about:blank' }))[0];
      if (blank?.id) await chrome.tabs.update(blank.id, { active: true });

      const raw = await chrome.storage.session.get('tabRecords');
      const records = raw.tabRecords ?? {};
      records[String(tab.id)] = {
        ...records[String(tab.id)],
        active: false,
        closeLocked: false,
        lastActivatedAt: now - 70 * 60 * 1000,
        firstObservedAt: now - 3 * 24 * 60 * 60 * 1000,
        inactivityCreditMs: 0,
        neverActivated: false,
        pendingCloseAt: now - 1000,
        pendingCloseScheduledAt: now - 2 * 60 * 1000,
        pendingCloseReason: 'Inactive for at least 60 minutes',
        pendingCloseRuleMinutes: 60,
        discarded: false,
      };
      await chrome.storage.session.set({ tabRecords: records });
      await chrome.storage.session.set({ sweepLease: null });
      return { ok: true, tabId: tab.id };
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

  const closeCheck = await swEval(
    cdp,
    swSession,
    `(async () => {
      const remaining = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      const recovery = (await chrome.storage.local.get('recoveryRecords:v1'))['recoveryRecords:v1'] ?? [];
      return {
        ok: ${closeResult?.ok === true},
        closed: ${JSON.stringify(sweepResponse?.data?.closed ?? 0)},
        tabRemoved: remaining.length === 0,
        recoveryCount: recovery.length,
        activityEventId: recovery[0]?.activityEventId ?? null,
      };
    })()`,
  );

  if (sweepResponse?.ok === true && closeCheck?.tabRemoved && closeCheck.recoveryCount > 0) {
    pass(`2. Tab closed with recovery record (activityEventId=${closeCheck.activityEventId ?? "pending"})`);
  } else {
    fail("2. Close with recovery", JSON.stringify({ closeResult, sweepResponse, closeCheck }));
  }

  console.log("\nRecovery 3: restore from recovery list…");
  const restoreResult = await swEval(
    cdp,
    panelSession,
    `(async () => {
      const recovery = (await chrome.storage.local.get('recoveryRecords:v1'))['recoveryRecords:v1'] ?? [];
      const id = recovery[0]?.id;
      if (!id) return { ok: false, reason: 'no-recovery' };
      const res = await chrome.runtime.sendMessage({
        v: 1,
        request: { type: 'RESTORE_RECOVERY', recoveryIds: [id], lock: false },
      });
      const tabs = await chrome.tabs.query({ url: ${JSON.stringify(testUrl)} });
      return { ok: res?.ok === true, restored: res?.data?.restored ?? 0, tabs: tabs.length };
    })()`,
  );

  if (restoreResult?.ok && restoreResult.restored === 1 && restoreResult.tabs >= 1) {
    pass("3. RESTORE_RECOVERY reopened the tab");
  } else {
    fail("3. Restore tab", JSON.stringify(restoreResult));
  }

  const activityCheck = await swEval(
    cdp,
    swSession,
    `(async () => {
      const index = (await chrome.storage.local.get('activityIndex:v1'))['activityIndex:v1'];
      return { hasActivity: (index?.count ?? 0) > 0 };
    })()`,
  );

  if (activityCheck?.hasActivity) {
    pass("4. Activity index has events after close/restore");
  } else {
    fail("4. Activity index", JSON.stringify(activityCheck));
  }
} catch (e) {
  console.error("\nUnexpected error:", e);
  anyFail = true;
} finally {
  if (cdp) cdp.close("recovery smoke done");
  if (httpServer) httpServer.close();
  if (chromeProc) {
    chromeProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
  if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

console.log("\n── Recovery smoke summary ───────────────────────────────────────");
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(`\n${anyFail ? "RECOVERY SMOKE FAILED" : "RECOVERY SMOKE PASSED"}`);
process.exit(anyFail ? 1 : 0);
