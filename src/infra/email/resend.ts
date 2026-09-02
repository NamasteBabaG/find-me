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

  async send(message: EmailMessage): Promise<{ id: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, tags: [{ name: "kind", value: message.tag }] }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }
}
