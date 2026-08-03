/**
 * A single row in the tab list with lock, wake, overflow menu, and bulk selection.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { TabView } from "../../shared/types.ts";
import { displayHostForTab } from "../../shared/sanitize.ts";
import { formatShortDuration } from "../../shared/time.ts";
import { computeInactiveMs } from "../../shared/eligibility.ts";
import { STRINGS } from "../../shared/strings.ts";
import { TabStateBadge } from "./TabStateBadge.tsx";

interface TabRowProps {
  tab: TabView;
  now: number;
  extensionId?: string;
  bulkMode?: boolean;
  selected?: boolean;
  onActivate: (tabId: number) => void;
  onToggleSelect?: (tabId: number, shiftKey?: boolean) => void;
  onLock?: (tabId: number) => void;
  onUnlock?: (tabId: number) => void;
  onSleep?: (tabId: number) => void;
  onWake?: (tabId: number) => void;
  onClose?: (tabId: number) => void;
  onKeepLoaded?: (tabId: number, keepLoaded: boolean) => void;
  onSnooze?: (tabId: number) => void;
  onNeverCloseSite?: (tabId: number) => void;
}

function faviconUrl(url: string): string {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
}

function PinIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.5 1h-3v1H8v5.5l-2 2V11H8.5v4h1v-4H12v-1.5l-2-2V2h1.5z" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 5v6h3l5 4V1L4 5H1zm11 3a3.5 3.5 0 0 0-2-3.15v6.3A3.5 3.5 0 0 0 12 8z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function SnoozeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2a5.5 5.5 0 0 0-4.7 8.3L2 13l2.7-1.3A5.5 5.5 0 1 0 8 2zm0 9.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
      <path d="M7 6h2v3H7z" />
    </svg>
  );
}

function SleepIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 11.5A6.5 6.5 0 0 1 11.5 2 7 7 0 1 0 2 11.5z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7zm2-2a1.5 1.5 0 1 0 3 0v2h-3V5z" />
    </svg>
  );
}

function WakeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a1 1 0 0 1 1 1v1.1A4 4 0 0 1 11.9 8H13a1 1 0 1 1 0 2h-1.1A4 4 0 0 1 9 11.9V13a1 1 0 1 1-2 0v-1.1A4 4 0 0 1 4.1 8H3a1 1 0 1 1 0-2h1.1A4 4 0 0 1 7 5.1V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function TabRow({
  tab,
  now,
  extensionId,
  bulkMode = false,
  selected = false,
  onActivate,
  onToggleSelect,
  onLock,
  onUnlock,
  onSleep,
  onWake,
  onClose,
  onKeepLoaded,
  onSnooze,
  onNeverCloseSite,
}: TabRowProps) {
  const [faviconError, setFaviconError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const host = displayHostForTab(tab.url, extensionId);
  const inactiveDuration = formatShortDuration(computeInactiveMs(tab, now));

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(tab.url);
    } catch {
      // Clipboard may be unavailable in some contexts.
    }
    setMenuOpen(false);
  };

  const runMenu = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  return (
    <div
      className={[
        "tab-row",
        selected ? "tab-row--selected" : "",
        closeTarget ? "tab-row--close-target" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="listitem"
    >
      {bulkMode && (
        <label className="tab-row__select">
          <input
            type="checkbox"
            className="tab-row__checkbox"
            checked={selected}
            readOnly
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect?.(tab.tabId, event.shiftKey);
            }}
            aria-label={`Select ${tab.title}`}
          />
        </label>
      )}

      <button
        type="button"
        className="tab-row__main"
        aria-label={
          bulkMode ? `Select ${tab.title} — ${host}` : `${tab.title} — ${host}`
        }
        onClick={(event) => {
          if (bulkMode) {
            onToggleSelect?.(tab.tabId, event.shiftKey);
            return;
          }
          onActivate(tab.tabId);
        }}
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

        <div
          className="tab-row__content"
          title={tab.title}
          data-tooltip={tab.title}
        >
          <span className="tab-row__title">{tab.title}</span>
          <span className="tab-row__host">{host}</span>
        </div>

        <div className="tab-row__meta">
          <TabStateBadge state={tab.displayState} />
          {tab.skipReason !== undefined && tab.skipReason.length > 0 && (
            <span
              className="tab-row__skip"
              title={tab.skipReason}
              data-tooltip={tab.skipReason}
            >
              {tab.skipReason}
            </span>
          )}
          <span
            className="tab-row__age"
            title={STRINGS.tooltips.inactive(inactiveDuration)}
            data-tooltip={STRINGS.tooltips.inactive(inactiveDuration)}
          >
            {inactiveDuration}
          </span>
        </div>

        <div className="tab-row__flags">
          {tab.pinned && (
            <span
              className="tab-row__flag tab-row__flag--pinned"
              title={STRINGS.tooltips.pinned}
              data-tooltip={STRINGS.tooltips.pinned}
            >
              <PinIcon />
              <span className="sr-only">Pinned</span>
            </span>
          )}
          {tab.audible && (
            <span
              className="tab-row__flag tab-row__flag--audible"
              title={STRINGS.tooltips.audible}
              data-tooltip={STRINGS.tooltips.audible}
            >
              <AudioIcon />
              <span className="sr-only">Playing audio</span>
            </span>
          )}
          {tab.closeLocked && (
            <span
              className="tab-row__flag tab-row__flag--locked"
              title={STRINGS.tooltips.locked}
              data-tooltip={STRINGS.tooltips.locked}
            >
              <LockIcon />
              <span className="sr-only">Locked</span>
            </span>
          )}
          {tab.keepLoaded && (
            <span
              className="tab-row__flag tab-row__flag--keep"
              title={STRINGS.tooltips.keepLoaded}
              data-tooltip={STRINGS.tooltips.keepLoaded}
            >
              Keep
            </span>
          )}
        </div>
      </button>

      <div className="tab-row__actions">
        {tab.discarded ? (
          <button
            type="button"
            className="tab-row__action"
            aria-label={`Wake ${tab.title}`}
            title={STRINGS.tooltips.wake}
            data-tooltip={STRINGS.tooltips.wake}
            onClick={() => onWake?.(tab.tabId)}
          >
            <WakeIcon />
          </button>
        ) : (
          <button
            type="button"
            className="tab-row__action"
            aria-label={`Sleep ${tab.title}`}
            title={STRINGS.tooltips.sleep}
            data-tooltip={STRINGS.tooltips.sleep}
            onClick={() => onSleep?.(tab.tabId)}
          >
            <SleepIcon />
          </button>
        )}

        <button
          type="button"
          className="tab-row__action"
          aria-label={`Snooze ${tab.title}`}
          title={STRINGS.tooltips.snooze}
          data-tooltip={STRINGS.tooltips.snooze}
          onClick={() => onSnooze?.(tab.tabId)}
        >
          <SnoozeIcon />
        </button>

        <button
          type="button"
          className="tab-row__action tab-row__action--danger"
          aria-label={tab.closeLocked ? `Close ${tab.title} manually` : `Close ${tab.title}`}
          title={tab.closeLocked ? STRINGS.tooltips.closeManual : STRINGS.tooltips.close}
          data-tooltip={tab.closeLocked ? STRINGS.tooltips.closeManual : STRINGS.tooltips.close}
          onMouseEnter={() => setCloseTarget(true)}
          onMouseLeave={() => setCloseTarget(false)}
          onFocus={() => setCloseTarget(true)}
          onBlur={() => setCloseTarget(false)}
          onClick={() => onClose?.(tab.tabId)}
        >
          <CloseIcon />
        </button>

        <div className="tab-row__menu" ref={menuRef}>
          <button
            type="button"
            className="tab-row__action"
            aria-label={`More actions for ${tab.title}`}
            title={STRINGS.tooltips.more}
            data-tooltip={STRINGS.tooltips.more}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreIcon />
          </button>

          {menuOpen && (
            <ul className="tab-row__menu-list" id={menuId} role="menu">
              <li role="none">
                <button type="button" role="menuitem" onClick={() => runMenu(() => onActivate(tab.tabId))}>
                  {STRINGS.tab.goTo}
                </button>
              </li>
              {tab.discarded ? (
                <li role="none">
                  <button type="button" role="menuitem" onClick={() => runMenu(() => onWake?.(tab.tabId))}>
                    {STRINGS.sleep.wake}
                  </button>
                </li>
              ) : (
                <li role="none">
                  <button type="button" role="menuitem" onClick={() => runMenu(() => onSleep?.(tab.tabId))}>
                    {STRINGS.sleep.action}
                  </button>
                </li>
              )}
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    runMenu(() =>
                      tab.closeLocked ? onUnlock?.(tab.tabId) : onLock?.(tab.tabId),
                    )
                  }
                >
                  {tab.closeLocked ? STRINGS.lock.unlock : STRINGS.lock.action}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    runMenu(() => onKeepLoaded?.(tab.tabId, !tab.keepLoaded))
                  }
                >
                  {tab.keepLoaded ? STRINGS.keepLoaded.off : STRINGS.keepLoaded.on}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => runMenu(() => onSnooze?.(tab.tabId))}>
                  {STRINGS.snooze.action}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runMenu(() => onNeverCloseSite?.(tab.tabId))}
                >
                  {STRINGS.hostRule.neverClose}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => runMenu(() => onClose?.(tab.tabId))}>
                  {tab.closeLocked ? STRINGS.close.manualAction : STRINGS.close.action}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => void copyUrl()}>
                  {STRINGS.tab.copyUrl}
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
