/** Local human-review sheet. No API, asset mutation, hosting or automatic navigation. */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve("work/fixed-sprite-pilot-20260908");
const out = path.resolve(process.argv.find(a => a.startsWith("--out="))?.slice(6) ?? path.join(root, "occluded-review-v1"));
if (existsSync(out)) throw new Error("Review output is immutable; choose a new directory");
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const rel = (file: string) => path.relative(out, file).split(path.sep).map(encodeURIComponent).join("/");
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const definitions = [
  { title: "יובל · גיל 8 · MEDIUM", dir: "standing-v1/automatic-occluded-joint-yuval-v1", review: "stages/occluded-joint-yuval-review-v1/result.json" },
  { title: "נועה · גיל 6 · MEDIUM", dir: "standing-v1/automatic-occluded-joint-noa-v1", review: "stages/occluded-joint-noa-review-v1/result.json" },
  { title: "יובל · גיל 8 · LOW", dir: "standing-v1/automatic-occluded-joint-yuval-low-v1", review: "quality-low-v1/stages/paired-low-review-v1/result.json" },
  { title: "נועה · גיל 6 · LOW", dir: "standing-v1/automatic-occluded-joint-noa-low-v1", review: "quality-low-v1/stages/paired-low-noa-review-v1/result.json" },
];
const records = definitions.map(d => {
  const candidate = path.join(root, d.dir, "freestanding-left-crates-candidate");
  if (!existsSync(path.join(candidate, "manifest.json"))) return { ...d, pending: true };
  const manifest = json(path.join(candidate, "manifest.json"));
  const inputs = json(path.join(root, d.dir, "inputs.json"));
  const receipt = json(path.join(path.dirname(inputs.sourceFile), "result.json"));
  const observation = json(inputs.observationFile);
  const reviewPath = path.join(root, d.review), review = existsSync(reviewPath) ? json(reviewPath) : null;
  return { ...d, pending: false, candidate, source: inputs.sourceFile, geometry: manifest.ok, facePx: manifest.measurements.scaleDistancePx,
    bodyPx: manifest.measurements.standingBodyDistancePx, checks: review?.checks ?? null, reason: review?.reason ?? null,
    sourceCents: receipt.costCents, observationCents: observation.costCents, reviewCents: review?.costCents ?? null,
    knownCosts: receipt.costUnknown === false && observation.costUnknown === false && review?.costUnknown === false,
    files: [path.join(candidate, "manifest.json"), path.join(candidate, "context.png"), ...(review ? [reviewPath] : [])].map(file => ({ file, sha256: hash(file) })) };
});
const labels: Record<string, string> = { identity: "זהות", faceIntegrity: "פנים שלמות", bodyPlacement: "מיקום והסתרה", ageProportions: "גיל", anatomy: "אנטומיה", style: "סגנון", relativeScale: "גודל ביחס לסביבה" };
const cents = (v: number) => `${v.toFixed(3)}¢`;
const cards = records.map(r => {
  if (r.pending || !("candidate" in r)) return `<article><h2>${esc(r.title)}</h2><p>הבדיקה עדיין לא הסתיימה בעת יצירת הדוח.</p></article>`;
  const total = r.sourceCents + r.observationCents + (r.reviewCents ?? 0);
  return `<article><h2>${esc(r.title)}</h2><p>בדיקות קוד: <strong>${r.geometry ? "עבר" : "לא עבר"}</strong> · פנים ${r.facePx.toFixed(1)}px · גוף ${r.bodyPx?.toFixed(1) ?? "—"}px</p>
  <div class="viewport"><a href="${rel(path.join(r.candidate, "context.png"))}"><img src="${rel(path.join(r.candidate, "context.png"))}" alt="הדמות מאחורי הארגזים על הבורד המקורי"></a></div>
  <p class="cost">ציור ${cents(r.sourceCents)} + מדידה ${cents(r.observationCents)} + שיפוט ${r.reviewCents === null ? "ממתין" : cents(r.reviewCents)}. ${r.knownCosts ? `סה״כ למקרה: ${cents(total)}` : "אין עדיין סך סופי ידוע."}</p>
  <ul>${Object.entries(r.checks ?? {}).map(([k, v]) => `<li>${esc(labels[k] ?? k)}: ${v === "pass" ? "עבר" : v === "fail" ? "נכשל" : "לא ודאי"}</li>`).join("")}</ul>
  <details><summary>נימוק השופט וראיות</summary><p dir="ltr">${esc(r.reason ?? "ממתין")}</p><p><a href="${rel(r.source)}">הספרייט המקורי ברזולוציה מלאה</a> · <a href="${rel(path.join(r.candidate, "board.png"))}">תצוגת הבורד המלא</a> · <a href="${rel(path.join(r.candidate, "manifest.json"))}">נתוני ההצבה</a></p></details>
  <details><summary>בקרות שליליות: הוזזה והגדלה מכוונות</summary><p>אותה דמות ואותו מחבוא. אלה בדיקות קוד, לא שיפוטים נוספים בתשלום.</p>${["floating", "oversized"].map(id => { const dir = path.join(root, r.dir, `freestanding-left-crates-${id}`), m = json(path.join(dir, "manifest.json")); return `<h3>${id === "floating" ? "הזזה למעלה ב־35 פיקסלים" : "הגדלה פי 1.5"}: ${m.ok ? "עבר — דורש אבחון" : "נדחה"}</h3><div class="viewport"><img src="${rel(path.join(dir, "context.png"))}" alt="בקרה שלילית"></div>`; }).join("")}</details></article>`;
}).join("");
const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מחבוא קבוע — בדיקה אנושית</title><style>body{margin:0;background:#f5f2ec;color:#202137;font:17px/1.65 system-ui,sans-serif}main{max-width:1480px;margin:auto;padding:28px}h1{line-height:1.2}header{max-width:980px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr));gap:22px}article{background:white;padding:20px;border-radius:18px}h2{font-size:23px}.viewport{overflow:auto;direction:ltr}img{display:block;width:650px;max-width:none;height:auto}article ul{padding-inline-start:22px}.cost{font-size:15px;color:#505267}a{color:#245e94}details{border-top:1px solid #ddd;padding:12px 0}summary{cursor:pointer}footer{padding-top:24px;font-size:14px}</style><main><header><h1>מחבוא פשוט, שתי ילדות — והשוואת איכות</h1><p>אותו בורד, אותו מקום ואותה מסכת ארגזים. לכל ילדה נוצר ספרייט אישי ונמדד אוטומטית פעם אחת. אין סימון ידני של הילדה, הזזת המחבוא או תיקון תמונה לאחר ההצבה.</p><p>הדוגמה הראשונה שימשה להכנת המחבוא. ההגדרה הוקפאה לפני נועה ולפני LOW. זו הוכחה ראשונית למקום אחד — לא אישור לכל העולם ולא מדידת שיעור הצלחה. אישור מודל אינו תחליף לשיפוט שלך.</p><p>התמונות מוצגות בגודל הקרופ המקורי; אפשר לגלול לרוחב או ללחוץ לפתיחת התמונה. העלות למקרה כוללת ציור, מדידה ושיפוט; אינה כוללת יצירת זהות קיימת, מחקר קודם או הכנת המחבוא החד־פעמית.</p></header><section>${cards}</section><footer>נוצר ${esc(new Date().toISOString())}. דוח מקומי בלבד; המשחקים והאתר החי לא שונו.</footer></main></html>`;
mkdirSync(out);
writeFileSync(path.join(out, "data.json"), JSON.stringify(records, null, 2), { flag: "wx" });
writeFileSync(path.join(out, "REPORT_HE.html"), html, { flag: "wx" });
console.log(path.join(out, "REPORT_HE.html"));
