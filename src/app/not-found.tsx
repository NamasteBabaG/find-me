import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { SiteFooter, SiteHeader } from "@/ui/Shell";

/** A page that hid too well: the site's own chrome around it, one way home. */
export default async function NotFound() {
  const [{ t }, user] = await Promise.all([getI18n(), currentUser()]);
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="nf fm-container fm-container--narrow fm-section fm-stack fm-stack--3 fm-center">
        <span className="nf__mark" aria-hidden>
          🙈
        </span>
        <h1>{t.notFound.title}</h1>
        <p className="fm-lead">{t.notFound.lead}</p>
        <Link href="/" className="fm-btn fm-btn--lg">
          {t.common.home}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
