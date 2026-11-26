import type { EmailMessage } from "@/infra/email/types";
import { dirOf, getDict, tf, type Locale } from "@/i18n";
import { escapeHtml } from "./html";
import type { ReadyMailHero } from "./ready-hero";
import type { TeamNoticeKind } from "@/domain/team-notices";

/**
 * Transactional emails in the recipient's language. Warm, one big button,
 * no marketing. Inline styles and tables only (email clients, Outlook too).
 * The only picture is the ready mail's child-free board (`ready-hero.ts`);
 * every message reads and works with pictures blocked.
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
  /** Inbox preview line, shown in the list and hidden in the message. */
  preheader?: string;
  /** Short messages read best centred; lists (the admin mail) keep the reading edge. */
  align?: "center" | "start";
  /** A board across the top of the card, and the world's name above the title. */
  hero?: ReadyMailHero;
}

/** The board, flush with the card's rounded top; while it loads or is blocked, the world's colour and its name. */
function heroRow(hero: ReadyMailHero): string {
  const tint = tintOf(hero);
  return `<tr><td bgcolor="${tint}" style="background:${tint};border-radius:28px 28px 0 0;padding:0;">
          <img src="${escapeHtml(hero.src)}" width="520" alt="${escapeHtml(hero.worldTitle)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none;text-decoration:none;border-radius:28px 28px 0 0;font-family:${FONT};font-size:16px;line-height:24px;font-weight:700;color:${P.ink};">
        </td></tr>`;
}

/** A colour reaches a style attribute only as a plain hex value. */
const tintOf = (hero: ReadyMailHero) => /^#[0-9A-Fa-f]{6}$/.test(hero.tint) ? hero.tint : P.panel;

/** Which world this is, on a soft pill of the world's own colour. */
const worldPill = (hero: ReadyMailHero) =>
  `<p style="margin:0 0 14px;"><span style="display:inline-block;padding:6px 16px;border-radius:999px;background:${tintOf(hero)};font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${P.ink};">${escapeHtml(hero.worldTitle)}</span></p>`;

function layout(locale: Locale, title: string, bodyHtml: string, options: LayoutOptions = {}): string {
  const t = getDict(locale);
  const dir = dirOf(locale);
  const start = dir === "rtl" ? "right" : "left";
  const align = options.align === "center" ? "center" : start;
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : "";
  return `<!doctype html><html dir="${dir}" lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${P.page};">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${P.page}" style="background:${P.page};"><tr><td align="center" style="padding:32px 14px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="max-width:520px;font-family:${FONT};color:${P.ink};">
    <tr><td style="padding:0 6px 18px;text-align:${start};">
      <span style="display:inline-block;vertical-align:middle;font-size:17px;font-weight:700;color:${P.ink};">${t.common.brand}</span>
    </td></tr>
    <tr><td bgcolor="${P.card}" style="background:${P.card};border-radius:28px;box-shadow:0 14px 34px rgba(23,22,43,0.07);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${options.hero ? heroRow(options.hero) : ""}
        <tr><td style="padding:${options.hero ? "24px" : "28px"} 30px 32px;text-align:${align};">
          ${options.hero ? worldPill(options.hero) : ""}
          <h1 style="margin:0 0 12px;font-family:${FONT};font-size:28px;line-height:36px;font-weight:800;color:${P.ink};">${escapeHtml(title)}</h1>
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
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:18px;line-height:22px;font-weight:700;color:${P.ink};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

const paragraph = (text: string, size = 17) =>
  `<p style="margin:0 auto;max-width:430px;font-family:${FONT};font-size:${size}px;line-height:${size + 10}px;color:${P.text};">${escapeHtml(text)}</p>`;

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
      { preheader: m.title, align: "center" },
    ),
    text: tf(m.text, { link: input.link }),
  };
}

/** `libraryLink` is absent when the game has no owner account to open a library for.
 * `helpLink` is the game's own help page (pilot QA, 2026-11-23: the mail named no way to help).
 * `hero` is the child-free first board of the game's world (`readyMailHero`); without one the mail is text only. */
export function gameReadyEmail(input: { to: string; childName: string; playLink: string; libraryLink?: string; helpLink?: string; sceneCount: number; locale: Locale; playMode?: "find-any"; targetCount?: number; hero?: ReadyMailHero | null }): EmailMessage {
  const r = getDict(input.locale).email.ready;
  const vars = { name: input.childName, count: input.sceneCount, stars: input.targetCount ?? input.sceneCount * 5, play: input.playLink, library: input.libraryLink ?? "", help: input.helpLink ?? "" };
  const variableWorld = input.targetCount !== undefined && input.targetCount !== input.sceneCount * 5;
  const body = tf(input.playMode === "find-any" ? (variableWorld ? r.bodyVariable : r.bodyFive) : r.body, vars);
  const start = dirOf(input.locale) === "rtl" ? "right" : "left";
  // The game is the one call; managing it and getting help are named under it, in a quiet panel, each its own link.
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin-${start === "right" ? "left" : "right"}:18px;padding:6px 0;font-family:${FONT};font-size:15px;line-height:24px;font-weight:700;color:${P.ink};text-decoration:underline;">${label}</a>`;
  const manage = input.libraryLink || input.helpLink
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr><td bgcolor="${P.panel}" style="background:${P.panel};border-radius:18px;padding:16px 18px;text-align:${start};">
        ${input.libraryLink ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:14px;line-height:22px;color:${P.text};">${r.manageLead}</p>` : ""}
        ${input.libraryLink ? link(input.libraryLink, r.manage) : ""}${input.helpLink ? link(input.helpLink, r.help) : ""}
      </td></tr></table>`
    : "";
  return {
    to: input.to,
    tag: "game-ready",
    subject: tf(r.subject, vars),
    html: layout(input.locale, tf(r.title, vars), `${paragraph(body)}${button(input.playLink, r.button)}${manage}`, {
      preheader: body,
      align: "center",
      ...(input.hero ? { hero: input.hero } : {}),
    }),
    text: (input.playMode === "find-any" ? `${body}\n${r.text}` : r.text)
      .split("\n")
      .filter((line) => (input.libraryLink || !line.includes("{library}")) && (input.helpLink || !line.includes("{help}")))
      .map((line) => tf(line, vars))
      .join("\n"),
  };
}

/** kingdom-generation/v6: the world reached its hard ceiling and the order was refunded. */
export function gameRefundedEmail(input: { to: string; childName: string; locale: Locale }): EmailMessage {
  const r = getDict(input.locale).email.refunded;
  const vars = { name: input.childName };
  return {
    to: input.to,
    tag: "game-refunded",
    subject: tf(r.subject, vars),
    html: layout(input.locale, tf(r.title, vars), paragraph(r.body), { preheader: r.body, align: "center" }),
    text: tf(r.text, vars),
  };
}

/** Every notice the team receives (team-notices/v1, src/domain/team-notices.ts says who gets which). */
export type AdminAlertKind = TeamNoticeKind;

const ALERT_HEAD: Record<AdminAlertKind, { subject: string; lead: string }> = {
  // team-notices/v1 (Guy, 2026-11-26): every real order, and every movement of its money, to the team's inboxes.
  "order-paid": { subject: "🧾 הזמנה חדשה: העולם של {name}", lead: "התקבל תשלום על עולם חדש. ספק הסליקה אישר את התשלום, והעולם נכנס להכנה." },
  "order-duplicate-paid": { subject: "⚠️ תשלום כפול על העולם של {name}", lead: "התקבל תשלום נוסף על עולם שכבר שולם. שני התשלומים נשמרו, אבל המשחק לא ייווצר פעמיים. צריך להחזיר את התשלום הכפול מספק הסליקה או מהאדמין." },
  "order-refunded": { subject: "↩️ הוחזר כסף: העולם של {name}", lead: "ההזמנה של העולם הזה הוחזרה, והעולם נסגר. הפרטים למטה." },
  "cost-above-alert": { subject: "💸 העולם של {name} עבר $5", lead: "העלות המחויבת של העולם עברה את סף ההתראה של $5. העולם ממשיך לעבוד כרגיל. מה קורה בתקרה, כתוב בפרטים." },
  // kingdom-generation/v7 and world-cost-rule/v1 (Guy, 2026-11-20): stopped at the ceiling and held for him; no refund, no parent mail.
  "ceiling-held": { subject: "🛑 העולם של {name} נעצר בתקרה", lead: "העולם הגיע לתקרה בלי להשלים את כל המחבואים ונעצר: לא נקנה בשבילו שום דבר נוסף. לא בוצע החזר ולא נשלחה הודעה להורה. אפשר לנסות להציל אותו מהאדמין, או להחזיר משם את הכסף." },
  "ceiling-refunded": { subject: "↩️ העולם של {name} הגיע לתקרת $7 והוחזר", lead: "העולם הגיע לתקרה הקשיחה של $7 בלי להשלים את כל המחבואים. הוא נסגר וההזמנה הוחזרה אוטומטית; הודעה להורה נשלחת בנפרד. כדאי לבדוק באדמין מה עצר אותו." },
  "ceiling-notice-failed": { subject: "📭 הודעת ההחזר להורה של {name} לא נשלחה", lead: "ההחזר בתקרת $7 בוצע, אבל ההודעה להורה לא נשלחה אחרי שלושה ניסיונות. יש ליצור קשר עם ההורה." },
  "ready-mail-failed": { subject: "📭 מייל ״המשחק מוכן״ של {name} לא נשלח", lead: "המשחק מוכן ואפשר לשחק בו, אבל המייל להורה לא נשלח אחרי שלושה ניסיונות. אפשר לשלוח שוב מדף המשחק באדמין או ליצור קשר עם ההורה." },
  "generation-stalled": { subject: "⏳ ההכנה של {name} מתעכבת", lead: "המשחק שולם אך ההכנה אינה מתקדמת או ממתינה לקיבולת שירות. לפתוח באדמין ולברר את חסימת התפעול. אין לבקש אישור איכות מההורה, לפרסם מחבואים פגומים או לחרוג מתקציב העולם." },
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
  /** The world's orders, one line each (amount, currency, state, dates). Only order notices carry them. */
  orders?: string[];
}): Omit<EmailMessage, "to"> {
  const head = ALERT_HEAD[input.kind];
  const subject = tf(head.subject, { name: input.childName || input.gameId });
  const facts = [
    `משחק: ${input.gameId} · ${input.sceneCount} לוחות · סטטוס ${input.status}`,
    `הורה: ${input.ownerEmail ?? "אין כתובת"}`,
    ...(input.orders ?? []),
    `עלות עד עכשיו: ${input.costCents === null ? "לא ידועה" : `$${(input.costCents / 100).toFixed(2)}`}`,
  ];
  const problems = input.problems.map((p) => `• ${p}`);
  const spots = input.failedSpots.map((f) => `• ${f.where} — ${f.attempts} ניסיונות — ${f.reason || "בלי סיבה רשומה"}`);
  const error = input.error ? [`שגיאה: ${input.error}`] : [];
  const list = (title: string, lines: string[]) => (lines.length ? `<p style="font-size:14px;line-height:22px;margin:16px 0 4px;font-weight:700;">${title}</p><p style="font-size:14px;line-height:22px;margin:0;">${lines.map(escapeHtml).join("<br>")}</p>` : "");
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
