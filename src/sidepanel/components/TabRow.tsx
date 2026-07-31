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
  onToggleSelect?: (tabId: number) => void;
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

function LockIcon({ filled = false }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M12 7h-1V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM7 5a1 1 0 0 1 2 0v2H7V5zm1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2M4 7h8v6H4z" />
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
    <div className={`tab-row${selected ? " tab-row--selected" : ""}`} role="listitem">
      {bulkMode && (
        <label className="tab-row__select">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(tab.tabId)}
            aria-label={`Select ${tab.title}`}
          />
        </label>
      )}

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
          {tab.skipReason !== undefined && tab.skipReason.length > 0 && (
            <span className="tab-row__skip" title={tab.skipReason}>
              {tab.skipReason}
            </span>
          )}
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
          {tab.keepLoaded && <span className="tab-row__flag tab-row__flag--keep">Keep</span>}
        </div>
      </button>

      <div className="tab-row__actions">
        {tab.discarded && (
          <button
            type="button"
            className="tab-row__action"
            aria-label={`Wake ${tab.title}`}
            onClick={() => onWake?.(tab.tabId)}
          >
            {STRINGS.sleep.wake}
          </button>
        )}

        <button
          type="button"
          className={`tab-row__action tab-row__action--lock${tab.closeLocked ? " tab-row__action--locked" : ""}`}
          aria-label={
            tab.closeLocked
              ? `Unlock ${tab.title}`
              : `Lock ${tab.title} from automatic closure`
          }
          aria-pressed={tab.closeLocked}
          onClick={() =>
            tab.closeLocked ? onUnlock?.(tab.tabId) : onLock?.(tab.tabId)
          }
        >
          <LockIcon filled={tab.closeLocked} />
        </button>

        <div className="tab-row__menu" ref={menuRef}>
          <button
            type="button"
            className="tab-row__action"
            aria-label={`More actions for ${tab.title}`}
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
