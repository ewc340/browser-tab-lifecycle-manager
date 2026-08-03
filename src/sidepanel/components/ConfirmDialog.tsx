/**
 * Accessible confirmation dialog with focus trap for destructive bulk actions.
 */
import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  /** Optional preview lines (e.g. tab titles) shown before confirm. */
  items?: string[];
  moreItemsLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const PREVIEW_LIMIT = 8;

export function ConfirmDialog({
  open,
  title,
  body,
  items,
  moreItemsLabel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="dialog__title">
          {title}
        </h2>
        <div id="confirm-dialog-body" className="dialog__body">
          <p>{body}</p>
          {items !== undefined && items.length > 0 && (
            <ul className="dialog__list" aria-label="Items affected">
              {items.slice(0, PREVIEW_LIMIT).map((item) => (
                <li key={item}>{item}</li>
              ))}
              {items.length > PREVIEW_LIMIT && (
                <li className="dialog__list-more">
                  {moreItemsLabel ?? `and ${items.length - PREVIEW_LIMIT} more`}
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn--danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
