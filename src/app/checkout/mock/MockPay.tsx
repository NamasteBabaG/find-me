"use client";

import { useState } from "react";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Shell";

export function MockPay({ orderId, successUrl, cancelUrl, amountLabel }: { orderId: string; successUrl: string; cancelUrl: string; amountLabel: string }) {
  const [busy, setBusy] = useState<"PAID" | "FAILED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pay = async (kind: "PAID" | "FAILED") => {
    setBusy(kind);
    setError(null);
    const res = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, kind }) });
    const data = (await res.json()) as { ok: boolean; body?: string };
    if (!data.ok) {
      setError(`ה־webhook נדחה: ${data.body ?? ""}`);
      setBusy(null);
      return;
    }
    window.location.href = kind === "PAID" ? successUrl : cancelUrl;
  };

  return (
    <div className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
      {error ? <Notice kind="danger">{error}</Notice> : null}
      <div className="fm-field">
        <label className="fm-label">מספר כרטיס</label>
        <input className="fm-input" value="4580 0000 0000 1234" readOnly dir="ltr" />
      </div>
      <div className="fm-row">
        <div className="fm-field" style={{ flex: 1 }}>
          <label className="fm-label">תוקף</label>
          <input className="fm-input" value="12/29" readOnly dir="ltr" />
        </div>
        <div className="fm-field" style={{ flex: 1 }}>
          <label className="fm-label">CVV</label>
          <input className="fm-input" value="123" readOnly dir="ltr" />
        </div>
      </div>
      <Button size="lg" block onClick={() => pay("PAID")} loading={busy === "PAID"} disabled={busy !== null}>
        אישור תשלום {amountLabel}
      </Button>
      <Button variant="danger" onClick={() => pay("FAILED")} loading={busy === "FAILED"} disabled={busy !== null}>
        לדמות תשלום שנכשל
      </Button>
      <p className="fm-small fm-center">הלחיצה שולחת webhook חתום לשרת — בדיוק כמו ספק תשלום אמיתי. רק ה־webhook מסמן הזמנה כשולמה.</p>
    </div>
  );
}
