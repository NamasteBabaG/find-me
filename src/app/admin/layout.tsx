import Link from "next/link";
import { currentAdmin, currentUser, isAdminEmail } from "@/lib/server/session";
import { SiteHeader } from "@/ui/Shell";

export const metadata = { title: "אדמין", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) {
    const user = await currentUser();
    return (
      <>
        <SiteHeader user={user} isAdmin={false} />
        <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--2 fm-center">
          <h1>אזור מנהלים</h1>
          <p className="fm-lead">{user ? "החשבון הזה אינו מנהל. הוסיפו את המייל ל־ADMIN_EMAILS." : "צריך להיכנס עם מייל של מנהל."}</p>
          <Link href="/library" className="fm-btn fm-btn--secondary">
            כניסה
          </Link>
        </main>
      </>
    );
  }
  return (
    <>
      <SiteHeader user={admin} isAdmin={isAdminEmail(admin.email)} />
      <main className="fm-container fm-section admin">
        <nav className="fm-nav" aria-label="אדמין">
          <Link href="/admin/orders">הזמנות</Link>
          <Link href="/admin/scenes">עולמות</Link>
          <Link href="/admin/costs">עלויות</Link>
        </nav>
        {children}
      </main>
    </>
  );
}
