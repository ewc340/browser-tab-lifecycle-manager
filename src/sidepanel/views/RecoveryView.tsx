/**
 * Recovery list — restore automatically closed tabs (M3).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecoveryRecord } from "../../shared/types.ts";
import { displayHostForTab } from "../../shared/sanitize.ts";
import { formatDate, formatShortDuration } from "../../shared/time.ts";
import { useTick } from "../hooks/useAppState.ts";
import { useMessaging } from "../hooks/useMessaging.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

export function RecoveryView() {
  const { send } = useMessaging();
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [extensionId, setExtensionId] = useState<string | undefined>();
  const now = useTick(30_000);
  const fetchingRef = useRef(false);

  const refresh = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    Promise.all([send({ type: "GET_RECOVERY" }), send({ type: "GET_APP_STATE" })])
      .then(([{ records: next }, state]) => {
        setRecords(next);
        setExtensionId(state.extensionId);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load recovery list");
      })
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  }, [send]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const restore = async (ids: string[], lock: boolean) => {
    await send({ type: "RESTORE_RECOVERY", recoveryIds: ids, lock });
    refresh();
  };

  const remove = async (ids: string[]) => {
    await send({ type: "DELETE_RECOVERY", recoveryIds: ids });
    refresh();
  };

  const clearAll = async () => {
    await send({ type: "CLEAR_RECOVERY" });
    setConfirmClear(false);
    refresh();
  };

  return (
    <div className="recovery-view">
      <p className="recovery-view__hint">
        Just closed? <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> may restore it with its full
        history.
      </p>

      {error !== null && (
        <p className="recovery-view__error" role="alert">
          {error}
        </p>
      )}

      {loading && records.length === 0 ? (
        <p className="recovery-view__empty">Loading recovery list…</p>
      ) : records.length === 0 ? (
        <p className="recovery-view__empty">No recoverable tabs. Automatically closed tabs appear here.</p>
      ) : (
        <>
          <ul className="recovery-view__list">
            {records.map((record) => {
              const canRestore = record.url.length > 0;
              const age = formatShortDuration(now - record.closedAt);
              const expiresIn = formatShortDuration(record.expiresAt - now);
              return (
                <li key={record.id} className="recovery-row">
                  <div className="recovery-row__main">
                    <span className="recovery-row__title">{record.title}</span>
                    <span className="recovery-row__host">
                      {canRestore
                        ? displayHostForTab(record.url, extensionId)
                        : "URL not stored (privacy setting)"}
                    </span>
                    <span className="recovery-row__meta">
                      Closed {age} ago · expires in {expiresIn}
                    </span>
                    {record.closeReason.length > 0 && (
                      <span className="recovery-row__reason">{record.closeReason}</span>
                    )}
                    {record.restoredAt !== undefined && (
                      <span className="recovery-row__restored">
                        Restored {formatDate(record.restoredAt)}
                      </span>
                    )}
                  </div>
                  <div className="recovery-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={!canRestore}
                      onClick={() => void restore([record.id], false)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={!canRestore}
                      onClick={() => void restore([record.id], true)}
                    >
                      Restore &amp; lock
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => void remove([record.id])}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmClear(true)}>
            Clear all recovery records
          </button>
        </>
      )}

      {confirmClear && (
        <ConfirmDialog
          open
          title="Clear all recovery records?"
          body="This permanently removes every recoverable tab. Closed tabs cannot be restored from this list afterward."
          confirmLabel="Clear all"
          onConfirm={() => void clearAll()}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
