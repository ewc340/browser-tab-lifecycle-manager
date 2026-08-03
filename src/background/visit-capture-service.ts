/**
 * Captures URL-level visits from tab events for thread clustering (M5).
 */
import type { VisitCloseReason, VisitRecord } from "../shared/thread-types.ts";
import { extractEntityKeys } from "../shared/entity-keys.ts";
import { normalizeUrl } from "../shared/url-normalizer.ts";
import { hostnameOf, sanitizeTitle, sanitizeUrl } from "../shared/sanitize.ts";
import { closeAndAssignVisit, persistVisit } from "./thread-store-service.ts";
import { getSession, setSession } from "./storage.ts";

export const SESSION_KEY_VISIT_CAPTURE = "visitCapture:v1";

interface ActiveVisitState {
  visit: VisitRecord;
  lastFocusedAt: number;
}

interface CaptureSessionState {
  activeByTab: Record<string, ActiveVisitState>;
  lastActiveTabId?: number | undefined;
  lastActiveWindowId?: number | undefined;
}

function emptyState(): CaptureSessionState {
  return { activeByTab: {} };
}

async function loadCaptureState(): Promise<CaptureSessionState> {
  return getSession<CaptureSessionState>(SESSION_KEY_VISIT_CAPTURE, emptyState());
}

async function saveCaptureState(state: CaptureSessionState): Promise<void> {
  await setSession({ [SESSION_KEY_VISIT_CAPTURE]: state });
}

function createVisitId(tabId: number, startedAt: number, normalizedUrl: string): string {
  const slug = normalizedUrl.slice(0, 48).replace(/[^a-zA-Z0-9]/g, "_");
  return `v_${startedAt}_${tabId}_${slug}`;
}

function buildVisitFromTab(tab: chrome.tabs.Tab, now: number, existing?: VisitRecord): VisitRecord | undefined {
  const rawUrl = tab.url ?? "";
  if (rawUrl.length === 0) return undefined;

  const normalizedUrl = normalizeUrl(rawUrl);
  if (normalizedUrl.length === 0) return undefined;

  const tabId = tab.id ?? 0;
  const title = sanitizeTitle(tab.title);
  const url = sanitizeUrl(rawUrl);
  const host = hostnameOf(rawUrl).toLowerCase();
  const entityKeys = extractEntityKeys(rawUrl, title);

  const visitId =
    existing?.visitId ?? createVisitId(tabId, now, normalizedUrl);

  return {
    visitId,
    normalizedUrl,
    url,
    title,
    favIconUrl: tab.favIconUrl,
    tabId,
    windowId: tab.windowId,
    openerTabId: tab.openerTabId === undefined ? undefined : tab.openerTabId,
    groupId: tab.groupId,
    entityKeys,
    host,
    startedAt: existing?.startedAt ?? now,
    lastSeenAt: now,
    totalDwellMs: existing?.totalDwellMs ?? 0,
    focusCount: existing?.focusCount ?? 1,
    endedAt: existing?.endedAt,
    closeReason: existing?.closeReason,
    threadId: existing?.threadId,
  };
}

function creditDwell(active: ActiveVisitState, now: number): void {
  const delta = Math.max(0, now - active.lastFocusedAt);
  if (delta <= 0) return;
  active.visit = {
    ...active.visit,
    totalDwellMs: active.visit.totalDwellMs + delta,
    lastSeenAt: now,
  };
  active.lastFocusedAt = now;
}

export async function captureTabCreated(tab: chrome.tabs.Tab, now: number): Promise<void> {
  const visit = buildVisitFromTab(tab, now);
  if (visit === undefined) return;

  const state = await loadCaptureState();
  state.activeByTab[String(visit.tabId)] = { visit, lastFocusedAt: now };
  await saveCaptureState(state);
  await persistVisit(visit);
}

export async function captureTabUpdated(
  tabId: number,
  tab: chrome.tabs.Tab,
  now: number,
): Promise<void> {
  const rawUrl = tab.url ?? "";
  if (rawUrl.length === 0) return;

  const normalizedUrl = normalizeUrl(rawUrl);
  const state = await loadCaptureState();
  const active = state.activeByTab[String(tabId)];

  if (active !== undefined && active.visit.normalizedUrl === normalizedUrl) {
    const updated = buildVisitFromTab(tab, now, active.visit);
    if (updated === undefined) return;
    active.visit = { ...updated, focusCount: active.visit.focusCount };
    active.lastFocusedAt = now;
    await saveCaptureState(state);
    await persistVisit(active.visit);
    return;
  }

  if (active !== undefined) {
    await endActiveVisitForTab(tabId, "NAVIGATION", now, state);
  }

  const visit = buildVisitFromTab(tab, now);
  if (visit === undefined) return;

  const freshState = await loadCaptureState();
  freshState.activeByTab[String(tabId)] = { visit, lastFocusedAt: now };
  await saveCaptureState(freshState);
  await persistVisit(visit);
}

export async function captureTabActivated(
  activeInfo: { tabId: number; windowId: number },
  now: number,
): Promise<void> {
  const state = await loadCaptureState();

  if (
    state.lastActiveTabId !== undefined &&
    state.lastActiveWindowId === activeInfo.windowId &&
    state.lastActiveTabId !== activeInfo.tabId
  ) {
    const prev = state.activeByTab[String(state.lastActiveTabId)];
    if (prev !== undefined) {
      creditDwell(prev, now);
      await persistVisit(prev.visit);
    }
  }

  const active = state.activeByTab[String(activeInfo.tabId)];
  if (active !== undefined) {
    active.visit = {
      ...active.visit,
      focusCount: active.visit.focusCount + 1,
      lastSeenAt: now,
    };
    active.lastFocusedAt = now;
    await persistVisit(active.visit);
  }

  state.lastActiveTabId = activeInfo.tabId;
  state.lastActiveWindowId = activeInfo.windowId;
  await saveCaptureState(state);
}

async function endActiveVisitForTab(
  tabId: number,
  closeReason: VisitCloseReason,
  now: number,
  state?: CaptureSessionState,
): Promise<void> {
  const captureState = state ?? await loadCaptureState();
  const active = captureState.activeByTab[String(tabId)];
  if (active === undefined) return;

  creditDwell(active, now);

  const closed: VisitRecord = {
    ...active.visit,
    endedAt: now,
    closeReason,
    lastSeenAt: now,
  };

  delete captureState.activeByTab[String(tabId)];
  if (captureState.lastActiveTabId === tabId) {
    captureState.lastActiveTabId = undefined;
  }
  await saveCaptureState(captureState);
  await closeAndAssignVisit(closed, now);
}

export async function captureTabRemoved(
  tabId: number,
  now: number,
  closeReason: VisitCloseReason,
): Promise<void> {
  await endActiveVisitForTab(tabId, closeReason, now);
}

export async function resolveCloseReason(tabId: number): Promise<VisitCloseReason> {
  const { SESSION_KEY_CLOSING_TAB_IDS } = await import("./storage.ts");
  const closingIds = await getSession<number[]>(SESSION_KEY_CLOSING_TAB_IDS, []);
  if (closingIds.includes(tabId)) return "EXTENSION";
  return "USER";
}

export async function flushActiveVisitDwell(now: number): Promise<void> {
  const state = await loadCaptureState();

  if (state.lastActiveTabId !== undefined) {
    const active = state.activeByTab[String(state.lastActiveTabId)];
    if (active !== undefined) {
      creditDwell(active, now);
    }
  }

  for (const active of Object.values(state.activeByTab)) {
    await persistVisit(active.visit);
  }

  await saveCaptureState(state);
}

/**
 * Bootstrap open tabs and flush in-memory dwell — used when the panel refreshes threads.
 */
export async function refreshVisitCapture(now: number): Promise<number> {
  await flushActiveVisitDwell(now);
  return bootstrapVisitsFromOpenTabs(now);
}

export async function bootstrapVisitsFromOpenTabs(now: number): Promise<number> {
  const { queryAllBrowserTabs } = await import("./tab-repository.ts");
  const tabs = await queryAllBrowserTabs();
  const state = await loadCaptureState();
  let bootstrapped = 0;

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (state.activeByTab[String(tab.id)] !== undefined) continue;

    const startedAt = tab.lastAccessed ?? now;
    const visit = buildVisitFromTab(tab, startedAt);
    if (visit === undefined) continue;

    const bootVisit: VisitRecord = {
      ...visit,
      startedAt,
      lastSeenAt: Math.max(startedAt, now),
      focusCount: tab.active ? 1 : 0,
      visitId: createVisitId(tab.id, startedAt, visit.normalizedUrl),
    };

    state.activeByTab[String(tab.id)] = { visit: bootVisit, lastFocusedAt: now };
    if (tab.active) {
      state.lastActiveTabId = tab.id;
      state.lastActiveWindowId = tab.windowId;
    }

    await persistVisit(bootVisit);
    bootstrapped++;
  }

  if (bootstrapped > 0) {
    await saveCaptureState(state);
  }

  return bootstrapped;
}

export async function captureTabRemovedWithReason(tabId: number, now: number): Promise<void> {
  const reason = await resolveCloseReason(tabId);
  await captureTabRemoved(tabId, now, reason);
}
