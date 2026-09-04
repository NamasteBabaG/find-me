import { promises as fs } from "node:fs";
import path from "node:path";
import type { EmailMessage, EmailProvider } from "./types";

/**
 * Dev email: prints to the server console AND drops a JSON file in
 * storage/outbox so /dev/outbox can show clickable links.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly id = "console" as const;
  constructor(private readonly outboxDir: string) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const id = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // The outbox file is for /dev/outbox to read. A serverless filesystem is
    // read-only, so writing it there fails — and failing the send meant a
    // finished game reported a broken pipeline because a dev convenience could
    // not write a file nobody was going to look at.
    try {
      await fs.mkdir(this.outboxDir, { recursive: true });
      await fs.writeFile(path.join(this.outboxDir, `${id}.json`), JSON.stringify({ id, sentAt: new Date().toISOString(), ...message }, null, 2));
    } catch (err) {
      console.warn(`[email:console] cannot write the outbox at ${this.outboxDir}:`, err instanceof Error ? err.message : err);
    }
    console.info(`\n📬 [email:${message.tag}] to ${message.to} — ${message.subject}\n${message.text}\n`);
    return { id };
  }

  async list(): Promise<Array<EmailMessage & { id: string; sentAt: string }>> {
    try {
      const files = await fs.readdir(this.outboxDir);
      const items = await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => JSON.parse(await fs.readFile(path.join(this.outboxDir, f), "utf8")) as EmailMessage & { id: string; sentAt: string }),
      );
      return items.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
    } catch {
      return [];
    }
  }
}
