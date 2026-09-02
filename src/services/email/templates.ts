import type { EmailMessage } from "@/infra/email/types";

/**
 * Transactional emails. Plain, warm Hebrew; one big button; no marketing.
 * Inline styles only (email clients).
 */
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#FFF8EC;font-family:Rubik,Arial,sans-serif;color:#2B2A33;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="background:#FFFFFF;border-radius:24px;padding:32px;box-shadow:0 8px 24px rgba(43,42,51,0.08);">
      <div style="font-size:14px;color:#8A8798;margin-bottom:16px;">איפה אני?</div>
      <h1 style="font-size:28px;line-height:36px;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#8A8798;text-align:center;margin-top:24px;">המשחק נשמר בספרייה שלכם וזמין ללא הגבלת זמן, בכפוף לתנאי השירות.</p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#FFB61E;color:#2B2A33;text-decoration:none;font-weight:700;font-size:18px;padding:16px 32px;border-radius:16px;margin:8px 0 16px;">${label}</a>`;
}

export function magicLinkEmail(input: { to: string; link: string }): EmailMessage {
  return {
    to: input.to,
    tag: "magic-link",
    subject: "הקישור שלכם לספריית המשחקים",
    html: layout(
      "כניסה לספרייה",
      `<p style="font-size:16px;line-height:24px;">לחצו על הכפתור כדי להיכנס. הקישור תקף ל־15 דקות.</p>${button(input.link, "כניסה לספרייה")}<p style="font-size:14px;color:#8A8798;">אם לא ביקשתם קישור, אפשר להתעלם מהמייל הזה.</p>`,
    ),
    text: `כניסה לספרייה: ${input.link}\n(תקף ל־15 דקות)`,
  };
}

export function gameReadyEmail(input: { to: string; childName: string; playLink: string; libraryLink: string; sceneCount: number }): EmailMessage {
  return {
    to: input.to,
    tag: "game-ready",
    subject: `המשחק של ${input.childName} מוכן!`,
    html: layout(
      `המשחק של ${input.childName} מוכן! 🎉`,
      `<p style="font-size:16px;line-height:24px;">${input.childName} מתחבא/ת עכשיו ב־${input.sceneCount} עולמות. כל עולם מסתיר שלוש הפתעות.</p>
       ${button(input.playLink, "לפתיחת המשחק")}
       <p style="font-size:14px;line-height:24px;">הקישור פרטי. אפשר לשלוח אותו לסבא וסבתא — ולנהל, לשתף או למחוק אותו מתוך הספרייה:</p>
       <p><a href="${input.libraryLink}" style="color:#1B6FA8;font-size:14px;">ניהול המשחק בספרייה שלי</a></p>`,
    ),
    text: `המשחק של ${input.childName} מוכן!\nלפתיחת המשחק: ${input.playLink}\nניהול בספרייה: ${input.libraryLink}`,
  };
}
