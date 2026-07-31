/**
 * Settings view — thresholds, host rules, theme, and safety guarantees.
 *
 * Automatic sleep/close toggles are visible but inert until Milestone 2 enables
 * the automation engine. Values still persist so onboarding can pre-configure them.
 */
import { useState } from "react";
import type { AppState, ExtensionSettings } from "../../shared/types.ts";
import {
  DEFAULT_SETTINGS,
  SETTINGS_RANGES,
} from "../../shared/defaults.ts";
import { STRINGS } from "../../shared/strings.ts";
import { useMessaging } from "../hooks/useMessaging.ts";

interface SettingsViewProps {
  state: AppState;
  onSettingsChanged: () => void;
}

const SLEEP_PRESETS = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "8 hours", minutes: 480 },
  { label: "24 hours", minutes: 1440 },
] as const;

const CLOSE_PRESETS = [
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "1 day", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10080 },
  { label: "14 days", minutes: 20160 },
  { label: "30 days", minutes: 43200 },
] as const;

const GRACE_PRESETS = [
  { label: "5 minutes", minutes: 5 },
  { label: "10 minutes", minutes: 10 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
] as const;

function DurationSelect({
  label,
  value,
  presets,
  rangeKey,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  presets: readonly { label: string; minutes: number }[];
  rangeKey: keyof typeof SETTINGS_RANGES;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  const preset = presets.find((entry) => entry.minutes === value);
  const [custom, setCustom] = useState(preset === undefined);

  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      <div className="settings-field__row">
        <select
          disabled={disabled}
          value={custom ? "custom" : String(value)}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "custom") {
              setCustom(true);
              return;
            }
            setCustom(false);
            onChange(Number(next));
          }}
        >
          {presets.map((entry) => (
            <option key={entry.minutes} value={entry.minutes}>
              {entry.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {custom && (
          <input
            type="number"
            disabled={disabled}
            min={SETTINGS_RANGES[rangeKey].min}
            max={SETTINGS_RANGES[rangeKey].max}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        )}
      </div>
    </label>
  );
}

function HostRuleEditor({
  title,
  hosts,
  onChange,
}: {
  title: string;
  hosts: string[];
  onChange: (hosts: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addHost = () => {
    const host = draft.trim().toLowerCase();
    if (host.length === 0 || hosts.includes(host)) return;
    onChange([...hosts, host]);
    setDraft("");
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section__title">{title}</h3>
      <div className="host-rule-editor">
        <div className="host-rule-editor__add">
          <input
            type="text"
            value={draft}
            placeholder="example.com or *.example.com"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addHost();
              }
            }}
          />
          <button type="button" className="btn btn--ghost" onClick={addHost}>
            Add
          </button>
        </div>
        <ul className="host-rule-editor__list">
          {hosts.map((host) => (
            <li key={host}>
              <span>{host}</span>
              <button
                type="button"
                className="btn btn--ghost"
                aria-label={`Remove ${host}`}
                onClick={() => onChange(hosts.filter((entry) => entry !== host))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SettingsView({ state, onSettingsChanged }: SettingsViewProps) {
  const { send } = useMessaging();
  const { settings } = state;
  const automationInert = !settings.onboardingCompleted;

  const patchSettings = async (patch: Partial<ExtensionSettings>) => {
    await send({ type: "UPDATE_SETTINGS", patch });
    onSettingsChanged();
  };

  return (
    <div className="settings-view">
      {!settings.onboardingCompleted && (
        <p className="settings-note">{STRINGS.settings.automationInert}</p>
      )}

      <section className="settings-section">
        <h2 className="settings-section__title">Automatic sleeping</h2>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.sleepEnabled}
            disabled={automationInert}
            onChange={(event) => void patchSettings({ sleepEnabled: event.target.checked })}
          />
          <span>Automatically sleep inactive tabs</span>
        </label>
        <DurationSelect
          label="Sleep after"
          value={settings.sleepAfterMinutes}
          presets={SLEEP_PRESETS}
          rangeKey="sleepAfterMinutes"
          disabled={automationInert}
          onChange={(minutes) => void patchSettings({ sleepAfterMinutes: minutes })}
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Automatic closure</h2>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.autoCloseEnabled}
            disabled={automationInert}
            onChange={(event) => void patchSettings({ autoCloseEnabled: event.target.checked })}
          />
          <span>Automatically close inactive tabs</span>
        </label>
        <DurationSelect
          label="Close after"
          value={settings.closeAfterMinutes}
          presets={CLOSE_PRESETS}
          rangeKey="closeAfterMinutes"
          disabled={automationInert}
          onChange={(minutes) => void patchSettings({ closeAfterMinutes: minutes })}
        />
        <DurationSelect
          label="Grace period"
          value={settings.closeGraceMinutes}
          presets={GRACE_PRESETS}
          rangeKey="closeGraceMinutes"
          disabled={automationInert}
          onChange={(minutes) => void patchSettings({ closeGraceMinutes: minutes })}
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Protection</h2>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.lockImpliesKeepLoaded}
            onChange={(event) =>
              void patchSettings({ lockImpliesKeepLoaded: event.target.checked })
            }
          />
          <span>Locked tabs also stay loaded in memory</span>
        </label>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Safety guarantees</h2>
        <ul className="settings-list">
          <li>Always skip active tabs</li>
          <li>Always skip pinned tabs</li>
          <li>Always skip audible tabs</li>
          <li>Always skip locked tabs when closing</li>
        </ul>
      </section>

      <HostRuleEditor
        title="Never sleep these sites"
        hosts={settings.neverSleepHosts}
        onChange={(neverSleepHosts) => void patchSettings({ neverSleepHosts })}
      />

      <HostRuleEditor
        title="Never close these sites"
        hosts={settings.neverCloseHosts}
        onChange={(neverCloseHosts) => void patchSettings({ neverCloseHosts })}
      />

      <section className="settings-section">
        <h2 className="settings-section__title">History</h2>
        <label className="settings-field">
          <span className="settings-field__label">Activity retention (days)</span>
          <input
            type="number"
            min={SETTINGS_RANGES.activityRetentionDays.min}
            max={SETTINGS_RANGES.activityRetentionDays.max}
            value={settings.activityRetentionDays}
            onChange={(event) =>
              void patchSettings({ activityRetentionDays: Number(event.target.value) })
            }
          />
        </label>
        <label className="settings-field">
          <span className="settings-field__label">Recovery retention (days)</span>
          <input
            type="number"
            min={SETTINGS_RANGES.recoveryRetentionDays.min}
            max={SETTINGS_RANGES.recoveryRetentionDays.max}
            value={settings.recoveryRetentionDays}
            onChange={(event) =>
              void patchSettings({ recoveryRetentionDays: Number(event.target.value) })
            }
          />
        </label>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Appearance</h2>
        <label className="settings-field">
          <span className="settings-field__label">Theme</span>
          <select
            value={settings.theme}
            onChange={(event) =>
              void patchSettings({
                theme: event.target.value as ExtensionSettings["theme"],
              })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Keyboard shortcuts</h2>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void send({ type: "OPEN_SHORTCUTS_PAGE" })}
        >
          {STRINGS.settings.shortcutsLink} →
        </button>
      </section>

      <section className="settings-section settings-section--muted">
        <p className="settings-reset-note">
          Defaults: sleep after {DEFAULT_SETTINGS.sleepAfterMinutes} minutes, close after{" "}
          {DEFAULT_SETTINGS.closeAfterMinutes / 60 / 24} days.
        </p>
      </section>
    </div>
  );
}
