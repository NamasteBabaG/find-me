"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** The confirming button's look: the destructive one for deletion. */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A question before something that cannot be undone, in the product's own
 * words and look: a native <dialog> (focus trap, Escape, backdrop) dressed as
 * `.fm-dialog`, instead of the browser's confirm() box.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, danger = false, pending = false, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // A confirming action may be destructive. Start from the safe way out
      // after the native modal opens, including when it opens again.
      cancelRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="fm-dialog"
      aria-labelledby={titleId}
      aria-describedby={children ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        // The native dialog also receives clicks on its own chrome. Only a
        // click outside its box belongs to the backdrop.
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCancel();
      }}
    >
      <div className="fm-dialog__body">
        <h2 id={titleId} className="fm-dialog__title">{title}</h2>
        {children ? <div id={descriptionId} className="fm-dialog__text">{children}</div> : null}
        <div className="fm-row fm-dialog__actions">
          <Button ref={cancelRef} type="button" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={pending}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
