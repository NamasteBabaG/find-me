export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Free-form tag for the outbox / provider dashboard (never PII). */
  tag: "magic-link" | "game-ready" | "gift" | "admin-alert";
  /** Stable logical delivery key; transport retries must reuse the same key and body. */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly id: "console" | "resend";
  send(message: EmailMessage, options?: { deadlineAt?: number }): Promise<{ id: string }>;
}
