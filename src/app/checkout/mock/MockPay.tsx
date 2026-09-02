"use client";

import { useState } from "react";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";

/**
 * Fake card form for testing. "Pay" and "Simulate failure" both POST to the
 * dev helper, which signs a webhook and feeds it through the real handler.
 */
export function MockPay({ orderId, successUrl, cancelUrl, amountLabel }: { orderId: string; successUrl: string; cancelUrl: string; amountLabel: string }) {
  const { t, tf } = useI18n();
  const m = t.create.mock;
  const [busy, setBusy] = useState<"PAID" | "FAILED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pay = async (kind: "PAID" | "FAILED") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, kind }) });
      const data = (await res.json()) as { ok: boolean; body?: string };
      if (!data.ok) {
        setError(tf(m.rejected, { body: data.body ?? "" }));
        setBusy(null);
        return;
      }
      window.location.href = kind === "PAID" ? successUrl : cancelUrl;
    } catch {
      setError(tf(m.rejected, { body: "network" }));
      setBusy(null);
    }
  };

  return (
    <form
      className="fm-stack fm-stack--3"
      onSubmit={(e) => {
        e.preventDefault();
        void pay("PAID");
      }}
    >
      {error ? <Notice kind="danger">{error}</Notice> : null}
      <div className="fm-field">
        <label htmlFor="mock-card" className="fm-label">
          {m.card}
        </label>
        <input id="mock-card" className="fm-input" defaultValue="4242 4242 4242 4242" inputMode="numeric" autoComplete="off" dir="ltr" />
      </div>
      <div className="psp__row">
        <div className="fm-field">
          <label htmlFor="mock-exp" className="fm-label">
            {m.expiry}
          </label>
          <input id="mock-exp" className="fm-input" defaultValue="12/29" inputMode="numeric" autoComplete="off" dir="ltr" />
        </div>
        <div className="fm-field">
          <label htmlFor="mock-cvv" className="fm-label">
            {m.cvv}
          </label>
          <input id="mock-cvv" className="fm-input" defaultValue="123" inputMode="numeric" autoComplete="off" dir="ltr" />
        </div>
      </div>
      <div className="fm-field">
        <label htmlFor="mock-name" className="fm-label">
          {m.nameOnCard}
        </label>
        <input id="mock-name" className="fm-input" defaultValue="Test Parent" autoComplete="off" />
      </div>
      <p className="fm-hint">{m.testHint}</p>
      <Button type="submit" size="lg" block loading={busy === "PAID"} disabled={busy !== null}>
        {tf(m.pay, { amount: amountLabel })}
      </Button>
      <div className="psp__foot">
        <Button type="button" variant="danger" size="sm" onClick={() => pay("FAILED")} loading={busy === "FAILED"} disabled={busy !== null}>
          {m.fail}
        </Button>
        <a href={cancelUrl} className="fm-small">
          {m.cancel}
        </a>
        <p className="fm-small fm-center">{m.note}</p>
      </div>
    </form>
  );
}
