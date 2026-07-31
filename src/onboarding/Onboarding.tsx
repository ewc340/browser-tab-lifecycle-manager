/**
 * Onboarding page shell — Milestone 0.
 *
 * Opened automatically on first install (reason === "install"). Shows the
 * product identity and explains that automatic management is currently off.
 * The enable flow arrives in Milestone 2 once the lifecycle engine is complete.
 */
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "../shared/product.ts";

export function Onboarding() {
  return (
    <div className="onboarding">
      <header className="onboarding__header">
        <h1 className="onboarding__title">{PRODUCT_NAME}</h1>
        <p className="onboarding__tagline">{PRODUCT_TAGLINE}</p>
      </header>

      <main className="onboarding__main">
        <section className="onboarding__section">
          <h2>Automatic management is currently <strong>OFF</strong></h2>
          <p>
            {PRODUCT_NAME} is installed and watching your tabs. It will not sleep or close any tabs
            automatically until you enable it during onboarding.
          </p>
          <p>
            You can open the side panel at any time by clicking the extension icon in the toolbar,
            or by pressing <kbd>Alt+Shift+T</kbd>.
          </p>
        </section>

        <section className="onboarding__section onboarding__section--notice">
          <h2>Enable automatic management</h2>
          <p>
            The full onboarding flow — where you can review your settings, set thresholds, and
            enable automatic tab sleeping and closing — arrives in <strong>Milestone 2</strong>.
          </p>
          <p>
            Until then, you can manually sleep and close tabs from the side panel. Your preferences
            and protection lists will be available in Settings once the full controls are built.
          </p>
        </section>
      </main>
    </div>
  );
}
