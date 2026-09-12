import type { EmailMessage, EmailProvider } from "./types";

/** Resend adapter via plain fetch (no SDK dependency). */
export class ResendEmailProvider implements EmailProvider {
  readonly id = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {
    if (!apiKey) throw new Error("RESEND_API_KEY is required for EMAIL_PROVIDER=resend");
  }

  async send(message: EmailMessage, options: { deadlineAt?: number } = {}): Promise<{ id: string }> {
    const timeoutMs = Math.min(15_000, (options.deadlineAt ?? Date.now() + 15_000) - Date.now());
    if (timeoutMs <= 0) throw new Error("Email dispatch deadline exhausted");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}) },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, tags: [{ name: "kind", value: message.tag }] }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    if (typeof data.id !== "string" || !data.id) throw new Error("Resend returned no delivery receipt");
    return { id: data.id };
    } finally { clearTimeout(timer); }
  }
}
