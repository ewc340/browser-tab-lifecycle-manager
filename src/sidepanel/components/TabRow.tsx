/**
 * A single row in the tab list.
 *
 * Structure: <li className="tab-row"> containing a <button className="tab-row__main">.
 * Future Milestone 1 action buttons (lock, overflow menu) will be siblings of that
 * button inside the same <li>, which is why the row is not itself the interactive element.
 *
 * Favicons are fetched via Chrome's local _favicon/ cache, never from the
 * remote favIconUrl, to avoid making outbound network requests (PRV-001).
 *
 * Age labels re-render on the 30s tick (PERF-005/006) by computing inactivity
 * from the live `now` timestamp rather than the snapshot frozen at fetch time.
 */
import { useState } from "react";
import type { TabView } from "../../shared/types.ts";
import { displayHostForTab } from "../../shared/sanitize.ts";
import { formatShortDuration } from "../../shared/time.ts";
import { computeInactiveMs } from "../../shared/eligibility.ts";
import { TabStateBadge } from "./TabStateBadge.tsx";

interface TabRowProps {
  tab: TabView;
  now: number;
  onActivate: (tabId: number) => void;
  extensionId?: string;
}

function faviconUrl(url: string): string {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
// SVG icons avoid emoji rendering inconsistency across platforms. Each is
// aria-hidden (the screen-reader label is in the sibling .sr-only span).

function PinIcon() {
  return (
    <svg
      role="img"
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M9.5 1h-3v1H8v5.5l-2 2V11H8.5v4h1v-4H12v-1.5l-2-2V2h1.5z" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg
      role="img"
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M1 5v6h3l5 4V1L4 5H1zm11 3a3.5 3.5 0 0 0-2-3.15v6.3A3.5 3.5 0 0 0 12 8z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      role="img"
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M12 7h-1V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM7 5a1 1 0 0 1 2 0v2H7V5zm1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
    </svg>
  );
}

export function TabRow({ tab, now, onActivate, extensionId }: TabRowProps) {
  const [faviconError, setFaviconError] = useState(false);
  const host = displayHostForTab(tab.url, extensionId);
  // Re-compute age from the live tick timestamp so labels update every 30 s
  // without refetching from the service worker (PERF-005/006).
  const inactiveDuration = formatShortDuration(computeInactiveMs(tab, now));

  return (
    <li className="tab-row">
      {/*
       * The activation button holds all read-only content. Milestone 1 will add
       * a lock button and overflow menu as siblings of this button inside the <li>.
       * A real <button> gets Enter/Space keyboard activation for free.
       */}
      <button
        type="button"
        className="tab-row__main"
        aria-label={`${tab.title} — ${host}`}
        onClick={() => onActivate(tab.tabId)}
      >
        <div className="tab-row__favicon" aria-hidden="true">
          {faviconError ? (
            <div className="tab-row__favicon-placeholder" />
          ) : (
            <img
              src={faviconUrl(tab.url)}
              alt=""
              width={16}
              height={16}
              onError={() => setFaviconError(true)}
            />
          )}
        </div>

        <div className="tab-row__content">
          <span className="tab-row__title">{tab.title}</span>
          <span className="tab-row__host">{host}</span>
        </div>

        <div className="tab-row__meta">
          <TabStateBadge state={tab.displayState} />
          <span className="tab-row__age" title={`Last active ${inactiveDuration} ago`}>
            {inactiveDuration}
          </span>
        </div>

        <div className="tab-row__flags">
          {tab.pinned && (
            <span className="tab-row__flag tab-row__flag--pinned">
              <PinIcon />
              <span className="sr-only">Pinned</span>
            </span>
          )}
          {tab.audible && (
            <span className="tab-row__flag tab-row__flag--audible">
              <AudioIcon />
              <span className="sr-only">Playing audio</span>
            </span>
          )}
          {tab.closeLocked && (
            <span className="tab-row__flag tab-row__flag--locked">
              <LockIcon />
              <span className="sr-only">Protected from automatic closing</span>
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
