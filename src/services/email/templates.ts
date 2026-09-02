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

export function gameReadyEmail(input: { to: string; childName: string; playLink: string; libraryLink: string; sceneCount: number; locale: Locale }): EmailMessage {
  const r = getDict(input.locale).email.ready;
  const vars = { name: input.childName, count: input.sceneCount, play: input.playLink, library: input.libraryLink };
  return {
    to: input.to,
    tag: "game-ready",
    subject: tf(r.subject, vars),
    html: layout(
      input.locale,
      tf(r.title, vars),
      `<p style="font-size:16px;line-height:24px;">${tf(r.body, vars)}</p>
       ${button(input.playLink, r.button)}
       <p style="font-size:14px;line-height:24px;">${r.manageLead}</p>
       <p><a href="${input.libraryLink}" style="color:#1B6FA8;font-size:14px;">${r.manage}</a></p>`,
    ),
    text: tf(r.text, vars),
  };
}
