/**
 * Onboarding page — enable automatic management and report-only mode.
 */
import { useState } from "react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "../shared/product.ts";
import { DEFAULT_SETTINGS } from "../shared/defaults.ts";
import { useMessaging } from "../sidepanel/hooks/useMessaging.ts";

export function Onboarding() {
  const { send } = useMessaging();
  const [reportOnly, setReportOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await send({
        type: "COMPLETE_ONBOARDING",
        enableAutomation: true,
        reportOnlyDays: reportOnly ? 7 : 0,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete onboarding.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <header className="onboarding__header">
        <h1 className="onboarding__title">{PRODUCT_NAME}</h1>
        <p className="onboarding__tagline">{PRODUCT_TAGLINE}</p>
      </header>

      <main className="onboarding__main">
        <section className="onboarding__section">
          <h2>How it works</h2>
          <p>
            Background tabs that stay inactive are put to sleep to save memory. Tabs that remain
            unused for a long time can be closed automatically, with a recoverable history.
          </p>
          <p>
            Active, pinned, audible, and locked tabs are never closed automatically. You can always
            sleep, lock, or close tabs manually from the side panel.
          </p>
        </section>

        <section className="onboarding__section">
          <h2>Default thresholds</h2>
          <ul className="settings-list">
            <li>Sleep after {DEFAULT_SETTINGS.sleepAfterMinutes} minutes of inactivity</li>
            <li>
              Close after {DEFAULT_SETTINGS.closeAfterMinutes / 60 / 24} days, with a{" "}
              {DEFAULT_SETTINGS.closeGraceMinutes}-minute grace period
            </li>
          </ul>
          <p>You can change these any time in Settings.</p>
        </section>

        <section className="onboarding__section">
          <h2>Report-only mode (recommended)</h2>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={reportOnly}
              disabled={busy || done}
              onChange={(event) => setReportOnly(event.target.checked)}
            />
            <span>
              For the first 7 days, only report what <em>would</em> be closed — do not close anything
              automatically
            </span>
          </label>
        </section>

        <section className="onboarding__section">
          <h2>Open the manager</h2>
          <p>
            Click the extension icon in the toolbar, or use{" "}
            <kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> on Mac (
            <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> on Windows/Linux).
          </p>
          <p>
            <strong>Arc and some other browsers do not apply the suggested shortcut automatically.</strong>
            Open <code>arc://extensions/shortcuts</code> (or your browser&apos;s extension shortcuts
            page) and assign <strong>Open Browser Tab Lifecycle Manager</strong> to{" "}
            <kbd>Alt+Shift+T</kbd>. Until you do, the keyboard shortcut will not work.
          </p>
          <p>
            On Arc, the manager opens in a sidebar-style popup window instead of Chrome&apos;s
            embedded side panel.
          </p>
        </section>

        {error !== null && (
          <p className="onboarding__error" role="alert">
            {error}
          </p>
        )}

        {done ? (
          <section className="onboarding__section onboarding__section--notice">
            <h2>Automatic management is on</h2>
            <p>
              Open the side panel to review your tabs.{" "}
              {reportOnly
                ? "Report-only mode is active for 7 days — you will see what would be closed before anything is removed."
                : "Automatic sleeping and closing are now active."}
            </p>
          </section>
        ) : (
          <button
            type="button"
            className="btn btn--primary onboarding__cta"
            disabled={busy}
            onClick={() => void enable()}
          >
            {busy ? "Enabling…" : "Enable automatic management"}
          </button>
        )}
      </main>
    </div>
  );
}
