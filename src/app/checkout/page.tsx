import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { draftSummary, sceneVersionForLevel, searchLevelChoice, worldsForDraft } from "@/services/create-flow.service";
import { storedSearchLevel } from "@/domain/search-level";
import { gameShape, worldsOwned } from "@/services/world-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { boardsFor, priceFor, WORLD_PRICES } from "@/domain/package";
import { childHasPaidWorld } from "@/services/child-pricing.service";
import { isCollectionVersion } from "@/domain/scene/local-patch-versions";
import { getCurrency, getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { CreateFrame } from "../create/CreateLayout";
import { currentDraft } from "@/lib/server/current-draft";
import { CheckoutForm } from "./CheckoutForm";
import { worldPurchaseDraftHref, worldPurchaseHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { outstandingCheckout } from "@/services/draft-checkout-lock";
import { ClosePaymentForm } from "./close/ClosePaymentForm";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.checkout.title };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; declined?: string; game?: string }> }) {
  const c = getContainer();
  const params = await searchParams;
  const [user, draft, { t, locale }] = await Promise.all([currentUser(), currentDraft(params.game), getI18n()]);
  if (params.game && !user) redirect(worldPurchaseSignInHref(worldPurchaseDraftHref(params.game, "checkout")));
  if (!draft?.childProfile) redirect("/create");
  const intent = user && draft.ownerId === user.id ? await c.db.childWorldPurchase.findUnique({ where: { activeGameId: draft.id } }) : null;
  const purchase = intent && user && intent.ownerId === user.id && intent.familyChildId === draft.familyChildId ? intent : null;
  if (purchase && !draft.childProfile.originalPhotoAssetId) redirect(`/create/photo?game=${encodeURIComponent(draft.id)}`);
  // A draft from before the cards were asked answers them first; a family world purchase fixed its level when it began.
  const levels = await searchLevelChoice(c, draft.styleVersion);
  if (!draft.searchLevel && !purchase && levels.shown) redirect("/create");
  const level = storedSearchLevel(draft.searchLevel);
  // A level whose boards were withdrawn is answered again before any payment page.
  if (!purchase && sceneVersionForLevel(draft.styleVersion, level) === null) redirect("/create");
  const [summary, worldCount] = await Promise.all([draftSummary(c, draft.id), worldsForDraft(c, draft.styleVersion, level).then(w => w.length)]);
  if (!summary?.pkg || summary.scenes.length !== boardsFor(summary.pkg.tier)) redirect("/create/scenes");
  // When the package takes every world there is, the worlds step was skipped, so "back" means the package step.
  const backHref = purchase ? worldPurchaseHref(purchase.familyChildId, purchase.worldSlug, purchase.returnGameId) : worldCount === summary.pkg.worldCount ? "/create/package" : "/create/scenes";
  const ck = t.create.checkout;
  const currency = await getCurrency();
  const continuation = !!user && user.id === draft.ownerId && await childHasPaidWorld(c.db, { ownerId: user.id, familyChildId: draft.familyChildId, excludeGameId: draft.id });
  const price = formatMoney(priceFor(summary.pkg.tier, currency, continuation), currency, locale);
  const packageName = continuation && summary.pkg.tier === "ONE_WORLD" ? t.home.pricing.additionalTitle : pick(summary.pkg.name, locale);
  const name = summary.child?.displayName ?? "";
  const shape = gameShape(summary.game.scenes);
  const worldNames = worldsOwned(summary.game.scenes.map(s => s.sceneSlug)).map(w => pick(w.name, locale)).join(" · ");
  // The address the parent typed last time, not the account they happen to be
  // signed in with: a grandparent buying a gift while logged in as themselves
  // came back from a declined card to find their own email in the box.
  const lastOrder = await c.db.order.findFirst({ where: { gameId: draft.id }, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } });
  const defaultEmail = lastOrder?.user.email ?? user?.email ?? "";
  const outcome = params.declined === "1" ? "declined" : params.cancelled === "1" ? "cancelled" : null;

  return (
    <CreateFrame width="mid" step={4} title={ck.title} user={user} isAdmin={isAdminEmail(user?.email)}>
      <div className="summary">
        <div className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
          <div className="summary__identity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={purchase ? `/api/drafts/photo?game=${encodeURIComponent(draft.id)}` : "/api/drafts/photo"} alt="" className="fm-sticker summary__face" width={80} height={80} />
            <div>
              <h3>{tf(ck.gameTitle, { name })}</h3>
              {summary.child?.ageYears != null ? <p className="fm-muted">{tf(ck.childAge, { age: summary.child.ageYears })}</p> : null}
              {/* The parent sees what they chose before paying; a game from before the cards says nothing new. */}
              {draft.searchLevel ? <p className="fm-muted">{tf(t.create.level.chosen, { level: t.create.level[level].name })}</p> : null}
              {purchase ? <p className="fm-hint">{tf(t.worldPurchase.frozenAge, { age: summary.child?.ageYears ?? "" })}</p> : <a className="summary__edit" href="/create">{draft.searchLevel ? ck.editChildLevel : ck.editChild}</a>}
            </div>
          </div>
          <div className="fm-stack fm-stack--1">
            <h3>{worldNames}</h3>
            <p className="fm-muted">{tf(ck.summaryLine, { pkg: packageName, boards: shape.places, spots: shape.spots })}</p>
          </div>
          {/* The full list is there for whoever wants it; it is not the first thing on the page. */}
          <details className="summary__more">
            <summary>{tf(ck.places, { n: summary.scenes.length })}</summary>
            <div className="summary__scenes">
              {summary.scenes.map((s) => (
                <span key={s.slug} className="fm-badge fm-badge--sea">
                  {pick(s.name, locale)}
                </span>
              ))}
            </div>
          </details>
          <div>
            <div className="summary__row">
              <span>{ck.total}</span>
              <strong className="package__worlds">{price}</strong>
            </div>
          </div>
          <p className="summary__passport">{t.home.pricing.passport}</p>
          {continuation ? <p className="fm-hint">{tf(t.home.pricing.returning, { price: formatMoney(WORLD_PRICES[currency].additional, currency, locale) })}</p> : null}
          <p className="fm-small">{ck.vat}</p>
        </div>
        <div className="fm-stack fm-stack--3"><CheckoutForm
          automaticPublication={summary.game.scenes.every(scene => scene.sceneVersion === 7 || isCollectionVersion(scene.sceneVersion))}
          defaultEmail={defaultEmail}
          priceLabel={price}
          outcome={outcome}
          backHref={backHref}
          gameId={purchase ? draft.id : undefined}
          backLabel={purchase ? t.worldPurchase.checkoutBack : undefined}
          lockedEmail={Boolean(purchase)}
        />
        {user && lastOrder?.userId === user.id && outstandingCheckout(lastOrder) ? <ClosePaymentForm gameId={draft.id} orderId={lastOrder.id} /> : null}</div>
      </div>
    </CreateFrame>
  );
}
