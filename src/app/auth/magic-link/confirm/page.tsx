import { cookies } from "next/headers";
import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { requireQaAccess } from "@/lib/server/qa-access";
import { familySignInHref, safeLocalPath } from "@/lib/safe-redirect";
import { getContainer } from "@/services/container";
import { inspectMagicLink } from "@/services/auth.service";
import { SiteFooter, SiteHeader } from "@/ui/Shell";
import { MAGIC_CONFIRM_COOKIE, magicConfirmationNonce } from "../challenge";
import "./confirmation.css";

export const dynamic = "force-dynamic";
// Native form POST under no-referrer sends Origin:null and fails the CSRF gate.
// Only the origin is allowed as a referrer; the token-bearing path stays private.
export const metadata = { robots: { index: false, follow: false }, referrer: "strict-origin" as const };

export default async function MagicLinkConfirmation({ searchParams }: { searchParams: Promise<{ token?: string | string[]; next?: string | string[] }> }) {
  await requireQaAccess();
  const [{ t }, query, jar] = await Promise.all([getI18n(), searchParams, cookies()]);
  const next = safeLocalPath(typeof query.next === "string" ? query.next : undefined, "/library");
  const token = typeof query.token === "string" ? query.token : "", container = getContainer();
  const nonce = magicConfirmationNonce(container.secret, token, jar.get(MAGIC_CONFIRM_COOKIE)?.value);
  const account = nonce ? await inspectMagicLink(container, token) : null;
  const copy = t.magicLinkConfirm;
  return <>
    <SiteHeader user={null} isAdmin={false} />
    <main className="magic-confirm-shell">
      <section className="magic-confirm-card fm-card" aria-labelledby="magic-confirm-title">
        <span className="magic-confirm-mark" aria-hidden>🔑</span>
        <h1 id="magic-confirm-title">{account ? copy.title : copy.invalidTitle}</h1>
        <p>{account ? copy.lead : copy.invalidBody}</p>
        {account && nonce && <>
          <dl className="magic-confirm-account"><dt>{copy.account}</dt><dd><bdi>{account.email}</bdi></dd></dl>
          <form action="/auth/magic-link" method="post">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="confirmation" value={nonce} />
            <input type="hidden" name="next" value={next} />
            <button className="fm-btn fm-btn--lg" type="submit">{copy.confirm}</button>
          </form>
        </>}
        <Link className="magic-confirm-back" href={account ? "/family" : familySignInHref(next, "expired")}>{copy.back}</Link>
      </section>
    </main>
    <SiteFooter />
  </>;
}
