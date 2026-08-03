/**
 * Root panel component.
 *
 * Responsibilities:
 * - Provides the theme via ThemeProvider.
 * - Owns top-level navigation: Tabs | Activity | Recovery | Settings.
 * - Shows a loading/error status in an aria-live region.
 * - Guards against version skew: if the extension updates while the panel is
 *   open, shows a banner offering a reload.
 */
import { useState } from "react";
import { ThemeProvider } from "./components/ThemeProvider.tsx";
import { ToastStack } from "./components/ToastStack.tsx";
import { TabsView } from "./views/TabsView.tsx";
import { ActivityView } from "./views/ActivityView.tsx";
import { RecoveryView } from "./views/RecoveryView.tsx";
import { SettingsView } from "./views/SettingsView.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { useAppState, useTick } from "./hooks/useAppState.ts";
import { useMessaging } from "./hooks/useMessaging.ts";
import { PRODUCT_SHORT_NAME } from "../shared/product.ts";
import { STRINGS } from "../shared/strings.ts";

type NavTab = "tabs" | "activity" | "recovery" | "settings";

const NAV_TABS: { id: NavTab; label: string }[] = [
  { id: "tabs", label: "Tabs" },
  { id: "activity", label: "Activity" },
  { id: "recovery", label: "Recovery" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [activeNav, setActiveNav] = useState<NavTab>("tabs");
  const { state, loading, error, versionSkew, refresh } = useAppState();
  const { send } = useMessaging();

  // Tick every 30 s so relative time labels (e.g. "3h ago") re-render without
  // fetching from the service worker (PERF-005/006). Returns the current
  // timestamp, updated on the interval.
  const now = useTick(30_000);

  const handleActivateTab = (tabId: number) => {
    send({ type: "ACTIVATE_TAB", tabId }).catch(() => refresh());
  };

  const theme = state?.settings.theme ?? "system";

  return (
    <ThemeProvider theme={theme}>
      <div className="app">
        <header className="app__header">
          <h1 className="app__title">{PRODUCT_SHORT_NAME}</h1>
        </header>

        {versionSkew && (
          <div className="banner banner--warning" role="alert">
            <span>Extension updated.</span>
            <button
              className="banner__action"
              onClick={() => location.reload()}
              type="button"
            >
              Reload panel
            </button>
          </div>
        )}

        {state !== null &&
          state.runtime.whatsNewVersion !== state.runtime.whatsNewSeenVersion && (
            <div className="banner banner--info" role="status">
              <span>
                Updated to v{state.extensionVersion}. See what changed in the release notes.
              </span>
              <a
                className="banner__action"
                href="https://github.com/ewc340/browser-tab-lifecycle-manager/releases"
                target="_blank"
                rel="noreferrer"
              >
                What&apos;s new
              </a>
              <button
                className="banner__action"
                type="button"
                onClick={() => void send({ type: "DISMISS_WHATS_NEW" }).then(() => refresh())}
              >
                Dismiss
              </button>
            </div>
          )}

        {state !== null && state.settings.automationPaused && (
          <div className="banner banner--muted" role="status">
            <span>{STRINGS.settings.automationPaused}</span>
            <button
              className="banner__action"
              type="button"
              onClick={() => void send({ type: "RESUME_AUTOMATION" }).then(() => refresh())}
            >
              {STRINGS.settings.resumeAutomation}
            </button>
          </div>
        )}

        {state !== null &&
          state.runtime.reportOnlyUntil > now &&
          state.settings.autoCloseEnabled && (
            <div className="banner banner--info" role="status">
              <span>
                {STRINGS.reportOnly.title(state.counts.pendingClose)}
              </span>
              <button
                className="banner__action"
                type="button"
                onClick={() => setActiveNav("tabs")}
              >
                {STRINGS.reportOnly.review}
              </button>
            </div>
          )}

        <nav className="app__nav" aria-label="Views">
          <ul className="nav-tabs">
            {NAV_TABS.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={activeNav === id ? "page" : undefined}
                  className={`nav-tab${activeNav === id ? " nav-tab--active" : ""}`}
                  onClick={() => setActiveNav(id)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="app__main">
          {/* Accessible status region for loading/error summaries */}
          <div role="status" aria-live="polite" className="sr-only">
            {loading && "Loading…"}
            {error !== null && `Error: ${error}`}
          </div>

          {loading && state === null && (
            <div className="loading-state" aria-hidden="true">
              Loading…
            </div>
          )}

          {error !== null && state === null && (
            <div className="error-state" role="alert">
              <p>Could not load tab data.</p>
              <p className="error-state__detail">{error}</p>
              <button type="button" onClick={() => refresh({ force: true })} className="btn btn--primary">
                Try again
              </button>
            </div>
          )}

          {state !== null && (
            <>
              {activeNav === "tabs" && (
                <TabsView
                  state={state}
                  now={now}
                  onActivateTab={handleActivateTab}
                  onRefresh={() => refresh({ force: true })}
                />
              )}
              {activeNav === "activity" && <ActivityView />}
              {activeNav === "recovery" && <RecoveryView />}
              {activeNav === "settings" && (
                <SettingsView state={state} onSettingsChanged={refresh} />
              )}
            </>
          )}

          <ToastStack />

          {!loading && error === null && state === null && (
            <EmptyState message="No data available." />
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}
