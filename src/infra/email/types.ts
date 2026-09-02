export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Free-form tag for the outbox / provider dashboard (never PII). */
  tag: "magic-link" | "game-ready" | "gift";
}

export interface EmailProvider {
  readonly id: "console" | "resend";
  send(message: EmailMessage): Promise<{ id: string }>;
}
