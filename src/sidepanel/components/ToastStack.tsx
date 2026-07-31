/**
 * Toast stack driven by service-worker TOAST broadcasts.
 */
import { useCallback, useEffect, useState } from "react";
import type { ToastPayload } from "../../shared/messages.ts";
import { isBroadcastEnvelope } from "../../shared/messages.ts";
import { useMessaging } from "../hooks/useMessaging.ts";

const TOAST_TTL_MS = 6_000;

export function ToastStack() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const { send } = useMessaging();

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const handleMessage = (msg: unknown) => {
      if (!isBroadcastEnvelope(msg) || msg.broadcast.type !== "TOAST") return;
      const toast = msg.broadcast.toast;
      setToasts((current) => [...current.slice(-2), toast]);
      window.setTimeout(() => dismiss(toast.id), TOAST_TTL_MS);
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [dismiss]);

  const handleUndo = (toast: ToastPayload) => {
    if (toast.undo === undefined) return;
    send(toast.undo).catch(() => undefined);
    dismiss(toast.id);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
          <div className="toast__content">
            <strong className="toast__title">{toast.title}</strong>
            {toast.body !== undefined && <p className="toast__body">{toast.body}</p>}
          </div>
          <div className="toast__actions">
            {toast.undo !== undefined && (
              <button type="button" className="toast__undo" onClick={() => handleUndo(toast)}>
                Undo
              </button>
            )}
            <button
              type="button"
              className="toast__dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
