"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";

export function FriendDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(), { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current; if (!dialog) return;
    if (open && !dialog.open) {
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (dialog.close) dialog.close(); else dialog.removeAttribute("open");
    }
  }, [open]);
  return <dialog ref={ref} className="friend-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="friend-dialog__head"><h2 id={titleId}>{title}</h2><button type="button" autoFocus onClick={onClose}>{t.friends.close}</button></div>
    <div className="friend-dialog__body">{children}</div>
  </dialog>;
}
