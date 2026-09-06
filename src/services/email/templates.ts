import type { EmailMessage } from "@/infra/email/types";
import { dirOf, getDict, tf, type Locale } from "@/i18n";

/**
 * Transactional emails in the recipient's language. Warm, one big button,
 * no marketing. Inline styles only (email clients).
 */
function layout(locale: Locale, title: string, bodyHtml: string): string {
  const t = getDict(locale);
  return `<!doctype html><html dir="${dirOf(locale)}" lang="${locale}"><body style="margin:0;background:#FBF8F2;font-family:Rubik,Arial,sans-serif;color:#17162B;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="background:#FFFFFF;border-radius:24px;padding:32px;box-shadow:0 8px 24px rgba(23,22,43,0.08);">
      <div style="font-size:14px;color:#807E96;margin-bottom:16px;">${t.common.brand}</div>
      <h1 style="font-size:28px;line-height:36px;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#807E96;text-align:center;margin-top:24px;">${t.email.footer}</p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#FFC53D;color:#17162B;text-decoration:none;font-weight:700;font-size:18px;padding:16px 32px;border-radius:999px;margin:8px 0 16px;">${label}</a>`;
}

export function magicLinkEmail(input: { to: string; link: string; locale: Locale }): EmailMessage {
  const m = getDict(input.locale).email.magic;
  return {
    to: input.to,
    tag: "magic-link",
    subject: m.subject,
    html: layout(input.locale, m.title, `<p style="font-size:16px;line-height:24px;">${m.body}</p>${button(input.link, m.button)}<p style="font-size:14px;color:#807E96;">${m.ignore}</p>`),
    text: tf(m.text, { link: input.link }),
  };
}

/** `libraryLink` is absent when the game has no owner account to open a library for. */
export function gameReadyEmail(input: { to: string; childName: string; playLink: string; libraryLink?: string; sceneCount: number; locale: Locale }): EmailMessage {
  const r = getDict(input.locale).email.ready;
  const vars = { name: input.childName, count: input.sceneCount, play: input.playLink, library: input.libraryLink ?? "" };
  const manage = input.libraryLink
    ? `<p style="font-size:14px;line-height:24px;">${r.manageLead}</p>
       <p><a href="${input.libraryLink}" style="color:#1B6FA8;font-size:14px;">${r.manage}</a></p>`
    : "";
  return {
    to: input.to,
    tag: "game-ready",
    subject: tf(r.subject, vars),
    html: layout(
      input.locale,
      tf(r.title, vars),
      `<p style="font-size:16px;line-height:24px;">${tf(r.body, vars)}</p>
       ${button(input.playLink, r.button)}
       ${manage}`,
    ),
    text: r.text
      .split("\n")
      .filter((line) => input.libraryLink || !line.includes("{library}"))
      .map((line) => tf(line, vars))
      .join("\n"),
  };
}

export type AdminAlertKind = "delivered-with-problems" | "held-for-review" | "generation-failed" | "needs-new-photo";

const ALERT_HEAD: Record<AdminAlertKind, { subject: string; lead: string }> = {
  "delivered-with-problems": { subject: "⚠️ המשחק של {name} נשלח עם בעיות", lead: "המשחק נשלח להורה בכל מקרה. אלה הבעיות שנמצאו לפני השליחה:" },
  "held-for-review": { subject: "🔎 המשחק של {name} ממתין לבדיקה", lead: "המשחק סיים עם בעיות ולא נשלח להורה: הוא מחכה לאדם. לפתוח באדמין, להסתכל על המחבואים, ולאשר או להריץ מחדש." },
  "generation-failed": { subject: "❌ יצירת המשחק של {name} נכשלה", lead: "הצינור נעצר בשגיאה והמשחק לא נשלח. לפתוח באדמין, לקרוא את השגיאה ולהריץ מחדש." },
  "needs-new-photo": { subject: "📷 המשחק של {name} צריך תמונה חדשה", lead: "אין תמונת מקור לצייר ממנה. ההורה רואה בקשה לתמונה חדשה בדף ההמתנה." },
};

/**
 * What the admins get when a game needs a look. Internal, Hebrew like the
 * admin area itself; the parent's mail is a different template and a different
 * recipient. `to` is filled in per admin by the sender.
 */
export function adminAlertEmail(input: {
  kind: AdminAlertKind;
  gameId: string;
  adminUrl: string;
  childName: string;
  ownerEmail: string | null;
  status: string;
  sceneCount: number;
  problems: string[];
  failedSpots: Array<{ where: string; attempts: number; reason: string }>;
  costCents: number;
  error?: string;
}): Omit<EmailMessage, "to"> {
  const head = ALERT_HEAD[input.kind];
  const subject = tf(head.subject, { name: input.childName || input.gameId });
  const facts = [
    `משחק: ${input.gameId} · ${input.sceneCount} לוחות · סטטוס ${input.status}`,
    `הורה: ${input.ownerEmail ?? "אין כתובת"}`,
    `עלות עד עכשיו: $${(input.costCents / 100).toFixed(2)}`,
  ];
  const problems = input.problems.map((p) => `• ${p}`);
  const spots = input.failedSpots.map((f) => `• ${f.where} — ${f.attempts} ניסיונות — ${f.reason || "בלי סיבה רשומה"}`);
  const error = input.error ? [`שגיאה: ${input.error}`] : [];
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = (title: string, lines: string[]) => (lines.length ? `<p style="font-size:14px;line-height:22px;margin:16px 0 4px;font-weight:700;">${title}</p><p style="font-size:14px;line-height:22px;margin:0;">${lines.map(esc).join("<br>")}</p>` : "");
  const html = layout(
    "he",
    subject,
    `<p style="font-size:16px;line-height:24px;">${head.lead}</p>
     ${list("פרטים", facts)}
     ${list("שגיאה", error)}
     ${list("מה נמצא", problems)}
     ${list("מחבואים שלא צוירו", spots)}
     ${button(input.adminUrl, "לפתוח באדמין")}`,
  );
  const text = [subject, "", head.lead, "", ...facts, ...(error.length ? ["", ...error] : []), ...(problems.length ? ["", "מה נמצא:", ...problems] : []), ...(spots.length ? ["", "מחבואים שלא צוירו:", ...spots] : []), "", `לפתוח באדמין: ${input.adminUrl}`].join("\n");
  return { tag: "admin-alert", subject, html, text };
}
