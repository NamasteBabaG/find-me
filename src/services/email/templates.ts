import type { EmailMessage } from "@/infra/email/types";
import { dirOf, getDict, tf, type Locale } from "@/i18n";

/**
 * Transactional emails in the recipient's language. Warm, one big button,
 * no marketing. Inline styles and tables only (email clients, Outlook too);
 * no images, so nothing depends on a host the mail client may not reach.
 */
const P = {
  page: "#FBF6EC",
  card: "#FFFFFF",
  ink: "#17162B",
  text: "#4D4B63",
  muted: "#8C89A3",
  sun: "#FFC53D",
  sunGlow: "rgba(245,178,27,0.32)",
  sunSoft: "#FFF2CC",
  panel: "#FFF8E8",
};
const FONT = "Rubik,'Segoe UI',Helvetica,Arial,sans-serif";

interface LayoutOptions {
  /** A friendly mark in the sunny band at the top of the card. */
  emoji?: string;
  /** Inbox preview line, shown in the list and hidden in the message. */
  preheader?: string;
  /** Short messages read best centred; lists (the admin mail) keep the reading edge. */
  align?: "center" | "start";
}

function layout(locale: Locale, title: string, bodyHtml: string, options: LayoutOptions = {}): string {
  const t = getDict(locale);
  const dir = dirOf(locale);
  const start = dir === "rtl" ? "right" : "left";
  const align = options.align === "center" ? "center" : start;
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${options.preheader}</div>`
    : "";
  const band = options.emoji
    ? `<tr><td align="center" bgcolor="${P.sunSoft}" style="background:${P.sunSoft};padding:30px 24px 26px;border-radius:28px 28px 0 0;">
        <div style="display:inline-block;width:78px;height:78px;line-height:78px;border-radius:999px;background:${P.card};font-size:38px;text-align:center;box-shadow:0 8px 18px ${P.sunGlow};">${options.emoji}</div>
      </td></tr>`
    : "";
  return `<!doctype html><html dir="${dir}" lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${P.page};">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${P.page}" style="background:${P.page};"><tr><td align="center" style="padding:32px 14px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="max-width:520px;font-family:${FONT};color:${P.ink};">
    <tr><td style="padding:0 6px 18px;text-align:${start};">
      <span style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:10px;background:${P.sun};font-size:18px;text-align:center;vertical-align:middle;">👀</span><span style="display:inline-block;vertical-align:middle;margin-${start}:10px;font-size:17px;font-weight:700;color:${P.ink};">${t.common.brand}</span>
    </td></tr>
    <tr><td bgcolor="${P.card}" style="background:${P.card};border-radius:28px;box-shadow:0 14px 34px rgba(23,22,43,0.07);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${band}
        <tr><td style="padding:28px 30px 32px;text-align:${align};">
          <h1 style="margin:0 0 12px;font-family:${FONT};font-size:28px;line-height:36px;font-weight:800;color:${P.ink};">${title}</h1>
          ${bodyHtml}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 12px 0;text-align:center;font-family:${FONT};font-size:12px;line-height:18px;color:${P.muted};">${t.email.footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** A pill that stays a pill where it can, and a clear block everywhere else. */
function button(href: string, label: string, align: "center" | "start" = "center"): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align === "center" ? ' align="center"' : ""} style="margin:24px ${align === "center" ? "auto" : "0"} 6px;"><tr><td bgcolor="${P.sun}" style="background:${P.sun};border-radius:999px;box-shadow:0 8px 18px ${P.sunGlow};">
    <a href="${href}" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:18px;line-height:22px;font-weight:700;color:${P.ink};text-decoration:none;border-radius:999px;">${label}</a>
  </td></tr></table>`;
}

const paragraph = (html: string, size = 17) =>
  `<p style="margin:0 auto;max-width:430px;font-family:${FONT};font-size:${size}px;line-height:${size + 10}px;color:${P.text};">${html}</p>`;

export function magicLinkEmail(input: { to: string; link: string; locale: Locale }): EmailMessage {
  const m = getDict(input.locale).email.magic;
  return {
    to: input.to,
    tag: "magic-link",
    subject: m.subject,
    html: layout(
      input.locale,
      m.title,
      `${paragraph(m.body, 16)}${button(input.link, m.button)}<p style="margin:14px auto 0;max-width:430px;font-family:${FONT};font-size:13px;line-height:20px;color:${P.muted};">${m.ignore}</p>`,
      { emoji: "🔑", preheader: m.title, align: "center" },
    ),
    text: tf(m.text, { link: input.link }),
  };
}

/** `libraryLink` is absent when the game has no owner account to open a library for. */
export function gameReadyEmail(input: { to: string; childName: string; playLink: string; libraryLink?: string; sceneCount: number; locale: Locale; playMode?: "find-any"; targetCount?: number }): EmailMessage {
  const r = getDict(input.locale).email.ready;
  const vars = { name: input.childName, count: input.sceneCount, stars: input.targetCount ?? input.sceneCount * 5, play: input.playLink, library: input.libraryLink ?? "" };
  const variableWorld = input.targetCount !== undefined && input.targetCount !== input.sceneCount * 5;
  const body = tf(input.playMode === "find-any" ? (variableWorld ? r.bodyVariable : r.bodyFive) : r.body, vars);
  const start = dirOf(input.locale) === "rtl" ? "right" : "left";
  // Who can open the game and where it is managed: a quiet panel under the button, not a second call.
  const manage = input.libraryLink
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr><td bgcolor="${P.panel}" style="background:${P.panel};border-radius:18px;padding:16px 18px;text-align:${start};">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:14px;line-height:22px;color:${P.text};">${r.manageLead}</p>
        <a href="${input.libraryLink}" style="font-family:${FONT};font-size:14px;line-height:22px;font-weight:700;color:${P.ink};text-decoration:underline;">${r.manage}</a>
      </td></tr></table>`
    : "";
  return {
    to: input.to,
    tag: "game-ready",
    subject: tf(r.subject, vars),
    html: layout(input.locale, tf(r.title, vars), `${paragraph(body)}${button(input.playLink, r.button)}${manage}`, {
      emoji: "🔍",
      preheader: body,
      align: "center",
    }),
    text: (input.playMode === "find-any" ? `${body}\n${r.text}` : r.text)
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
  costCents: number | null;
  error?: string;
}): Omit<EmailMessage, "to"> {
  const head = ALERT_HEAD[input.kind];
  const subject = tf(head.subject, { name: input.childName || input.gameId });
  const facts = [
    `משחק: ${input.gameId} · ${input.sceneCount} לוחות · סטטוס ${input.status}`,
    `הורה: ${input.ownerEmail ?? "אין כתובת"}`,
    `עלות עד עכשיו: ${input.costCents === null ? "לא ידועה" : `$${(input.costCents / 100).toFixed(2)}`}`,
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
     ${button(input.adminUrl, "לפתוח באדמין", "start")}`,
  );
  const text = [subject, "", head.lead, "", ...facts, ...(error.length ? ["", ...error] : []), ...(problems.length ? ["", "מה נמצא:", ...problems] : []), ...(spots.length ? ["", "מחבואים שלא צוירו:", ...spots] : []), "", `לפתוח באדמין: ${input.adminUrl}`].join("\n");
  return { tag: "admin-alert", subject, html, text };
}
