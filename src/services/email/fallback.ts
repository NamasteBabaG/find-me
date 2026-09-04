import type { EmailMessage } from "@/infra/email/types";

/**
 * Where a mail goes when there is nobody to send it to.
 *
 * A finished game with no owner email is a game nobody will ever open: the
 * link ends up in a log on a server the parent cannot see. Until every path
 * into a paid game guarantees an address, an operator's inbox
 * (EMAIL_FALLBACK_TO) receives it instead — stamped in the subject and at the
 * top of the body so it can never be mistaken for a customer's mail, and so
 * the day it stops being needed is easy to notice. Temporary by design.
 */
export const FALLBACK_STAMP = "[FALLBACK — no recipient]";

export function routeMail(message: EmailMessage, fallback: string | null | undefined): { message: EmailMessage; viaFallback: boolean } | null {
  if (message.to) return { message, viaFallback: false };
  if (!fallback) return null;
  const note = `${FALLBACK_STAMP} This game has no recipient email on file; it was delivered to the fallback inbox instead.`;
  return {
    viaFallback: true,
    message: {
      ...message,
      to: fallback,
      subject: `${FALLBACK_STAMP} ${message.subject}`,
      html: `<p style="font-family:monospace;font-size:13px;line-height:20px;background:#FFF3CD;color:#5C4400;padding:12px 16px;border-radius:8px;">${note}</p>${message.html}`,
      text: `${note}\n\n${message.text}`,
    },
  };
}
