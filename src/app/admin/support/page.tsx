import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/require-admin";
import { getContainer } from "@/services/container";
import { listSupportRequests, resolveSupportRequest } from "@/services/support.service";
import { serviceCopy } from "@/domain/legal";

async function resolve(form: FormData) {
  "use server";
  const admin = await requireAdmin();
  await resolveSupportRequest(getContainer(), String(form.get("id") ?? ""), admin.id);
  revalidatePath("/admin/support");
}

export default async function SupportInbox({ searchParams }: { searchParams: Promise<{ closed?: string; cursor?: string }> }) {
  await requireAdmin();
  const params = await searchParams, closed = params.closed === "1";
  const { requests: rows, nextCursor } = await listSupportRequests(getContainer().db, closed, params.cursor);
  return <div className="fm-stack fm-stack--3">
    <h1>פניות שירות</h1>
    <p>הפניות נשמרות בשרת. סימון ‘טופל’ מתעד טיפול בלבד ואינו שולח מייל, מבטל משחק או מבצע החזר. יש להשיב לפונה ולבצע את הפעולה הנדרשת בנפרד.</p>
    <nav className="fm-nav"><Link href="/admin/support">פתוחות</Link><Link href="/admin/support?closed=1">טופלו</Link></nav>
    <p className="fm-hint">מוצגות פניות מתוך 50 ההודעות בעמוד זה. אפשר לעבור לעמודים קודמים. פרטי פניות בני יותר משנה נמחקים במחזור התחזוקה.</p>
    {!rows.length ? <p>אין פניות להצגה.</p> : null}
    {rows.map(row => <article key={row.id} className="fm-card fm-card--pad-3 fm-stack fm-stack--2">
      <h2>{serviceCopy.he.topics[row.topic]}</h2>
      <p className="service-reference" dir="ltr">{row.id}</p>
      <p>{row.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</p>
      <p><a href={`mailto:${row.email}`} dir="ltr">{row.email}</a> · שפת הפנייה: {row.locale}</p>
      {row.order ? <p>פרט לאיתור הרכישה: {row.order}</p> : null}
      {row.message ? <p className="service-message">{row.message}</p> : null}
      {!closed ? <form action={resolve}><input type="hidden" name="id" value={row.id} /><button type="submit" className="fm-btn fm-btn--secondary">המענה והטיפול הושלמו — סימון כטופל</button></form> : null}
    </article>)}
    {nextCursor ? <Link href={`/admin/support?closed=${closed ? "1" : "0"}&cursor=${nextCursor}`} className="fm-btn fm-btn--secondary">פניות קודמות</Link> : null}
  </div>;
}
