import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { draftSummary } from "@/services/create-flow.service";
import { purchasableWorldSlugs } from "@/services/world-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { boardsFor, priceFor, searchesFor } from "@/domain/package";
import { getCurrency, getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { CreateFrame } from "../create/CreateLayout";
import { currentDraft } from "../create/actions";
import { CheckoutForm } from "./CheckoutForm";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.checkout.title };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; declined?: string }> }) {
  const c = getContainer();
  const [user, draft, params, { t, locale }] = await Promise.all([currentUser(), currentDraft(), searchParams, getI18n()]);
  if (!draft?.childProfile) redirect("/create");
  const [summary, worldCount] = await Promise.all([draftSummary(c, draft.id), purchasableWorldSlugs(c).then((w) => w.length)]);
  if (!summary?.pkg || summary.scenes.length !== boardsFor(summary.pkg.tier)) redirect("/create/scenes");
  // When the package takes every world there is, the worlds step was skipped, so "back" means the package step.
  const backHref = worldCount === summary.pkg.worldCount ? "/create/package" : "/create/scenes";
  const ck = t.create.checkout;
  const currency = await getCurrency();
  const price = formatMoney(priceFor(summary.pkg.tier, currency), currency, locale);
  const name = summary.child?.displayName ?? "";
  // The address the parent typed last time, not the account they happen to be
  // signed in with: a grandparent buying a gift while logged in as themselves
  // came back from a declined card to find their own email in the box.
  const lastOrder = await c.db.order.findFirst({ where: { gameId: draft.id }, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } });
  const defaultEmail = lastOrder?.user.email ?? user?.email ?? "";
  const outcome = params.declined === "1" ? "declined" : params.cancelled === "1" ? "cancelled" : null;

  return (
    <CreateFrame width="mid" step={4} title={ck.title} lead={ck.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <div className="summary">
        <div className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
          <div className="fm-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/drafts/photo" alt="" className="fm-sticker" width={80} height={80} style={{ width: 80, height: 80 }} />
            <div>
              <h3>{tf(ck.gameTitle, { name })}</h3>
              <p className="fm-muted">{tf(ck.summaryLine, { pkg: pick(summary.pkg.name, locale), boards: boardsFor(summary.pkg.tier), spots: searchesFor(summary.pkg.tier) })}</p>
            </div>
          </div>
          <div className="summary__scenes">
            {summary.scenes.map((s) => (
              <span key={s.slug} className="fm-badge fm-badge--sea">
                {pick(s.name, locale)}
              </span>
            ))}
          </div>
          <div>
            <div className="summary__row">
              <span>{pick(summary.pkg.name, locale)}</span>
              <strong>{price}</strong>
            </div>
            <div className="summary__row">
              <span>{ck.total}</span>
              <strong className="package__worlds">{price}</strong>
            </div>
          </div>
          <p className="fm-small">{ck.vat}</p>
        </div>
        <CheckoutForm defaultEmail={defaultEmail} priceLabel={price} outcome={outcome} backHref={backHref} />
      </div>
    </CreateFrame>
  );
}
