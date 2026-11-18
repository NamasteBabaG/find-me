
import { creationDraftHref } from "@/domain/creation-draft";
import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { detectiveSelectionEligible, draftSummary, searchLevelTerms, worldsForDraft } from "@/services/create-flow.service";
import { storedSearchLevel } from "@/domain/search-level";
import { gameShape, worldsOwned } from "@/services/world-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { boardsFor, priceFor, WORLD_PRICES } from "@/domain/package";
import { childHasPaidWorld } from "@/services/child-pricing.service";
import { parsePhotoCrop } from "@/domain/photo-frame";
import { FramedPhoto } from "@/ui/FramedPhoto";
import { WorldEmblem } from "@/ui/WorldEmblem";
import { Icon } from "@/ui/Icon";
import { LinkButton } from "@/ui/Button";
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

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; declined?: string; game?: string; draft?: string }> }) {
  const c = getContainer();
  const params = await searchParams;
  if (params.game && params.draft) redirect("/create");
  const [user, draft, { t, locale }] = await Promise.all([currentUser(), currentDraft(params.game ?? params.draft, params.draft ? "creation" : "world-purchase"), getI18n()]);
  if (params.game && !user) redirect(worldPurchaseSignInHref(worldPurchaseDraftHref(params.game, "checkout")));
  if (!draft?.childProfile) redirect("/create");
  const intent = user && draft.ownerId === user.id ? await c.db.childWorldPurchase.findUnique({ where: { activeGameId: draft.id } }) : null;
  const purchase = intent && user && intent.ownerId === user.id && intent.familyChildId === draft.familyChildId ? intent : null;
  if (purchase && !draft.childProfile.originalPhotoAssetId) redirect(`/create/photo?game=${encodeURIComponent(draft.id)}`);
  // The same terms checkout applies. Only a draft that was asked must have answered; a
  // level that can no longer be sold is asked again; an open payment keeps its terms and
  // is never sent away from them. A family world purchase fixed its level when it began.
  const terms = await searchLevelTerms(c, draft);
  const level = storedSearchLevel(draft.searchLevel);
  if (!purchase && !terms.openPayment && (terms.stale || terms.required && !draft.searchLevel)) redirect("/create");
  // A Detectives world withdrawn after it was chosen is chosen again where worlds are chosen.
  if (!purchase && !terms.openPayment && level === "detectives" && !await detectiveSelectionEligible(c, draft)) redirect(creationDraftHref("scenes", draft.id));
  const [summary, worldCount] = await Promise.all([draftSummary(c, draft.id), worldsForDraft(c, draft.styleVersion, level).then(w => w.length)]);
  if (!summary?.pkg || summary.scenes.length !== boardsFor(summary.pkg.tier)) redirect(creationDraftHref("scenes", draft.id));
  // When the draft holds every world there is, the worlds step skips itself, so "back" means the photo.
  const backToPhoto = worldCount === summary.pkg.worldCount;
  const backHref = purchase ? worldPurchaseHref(purchase.familyChildId, purchase.worldSlug, purchase.returnGameId) : creationDraftHref(backToPhoto ? "photo" : "scenes", draft.id);
  const backLabel = purchase ? t.worldPurchase.checkoutBack : backToPhoto ? t.create.checkout.backPhoto : t.create.checkout.backScenes;
  const ck = t.create.checkout;
  const currency = await getCurrency();
  const continuation = !!user && user.id === draft.ownerId && await childHasPaidWorld(c.db, { ownerId: user.id, familyChildId: draft.familyChildId, excludeGameId: draft.id });
  const price = formatMoney(priceFor(summary.pkg.tier, currency, continuation), currency, locale);
  const name = summary.child?.displayName ?? "";
  const shape = gameShape(summary.game.scenes);
  const worlds = worldsOwned(summary.game.scenes.map(s => s.sceneSlug));
  const photoSrc = purchase ? `/api/drafts/photo?game=${encodeURIComponent(draft.id)}` : `/api/drafts/photo?draft=${encodeURIComponent(draft.id)}`;
  const facts = [summary.child?.ageYears != null ? tf(ck.childAge, { age: summary.child.ageYears }) : null,
    // The parent sees the path they chose before paying; a game from before the cards says nothing new.
    draft.searchLevel ? t.create.level[level].name : null].filter(Boolean).join(" · ");
  // The address the parent typed last time, not the account they happen to be
  // signed in with: a grandparent buying a gift while logged in as themselves
  // came back from a declined card to find their own email in the box.
  const lastOrder = await c.db.order.findFirst({ where: { gameId: draft.id }, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } });
  const defaultEmail = lastOrder?.user.email ?? user?.email ?? "";
  const outcome = params.declined === "1" ? "declined" : params.cancelled === "1" ? "cancelled" : null;

  return (
    <CreateFrame width="mid" step={3} title={ck.title} user={user} isAdmin={isAdminEmail(user?.email)}>
      {/* Two equal halves: what is being bought, and paying for it (Guy, 2026-11-18). Only what the
          parent needs to decide: who, which world, how big, the price. The board list stays a surprise. */}
      <div className="summary">
        <section className="fm-card summary__card summary__order" aria-labelledby="order-title">
          <div className="summary__who">
            <FramedPhoto src={photoSrc} crop={parsePhotoCrop(draft.childProfile.photoCropJson)} size={64} className="summary__face" />
            <div className="summary__lines">
              <h2 id="order-title" className="summary__title">{tf(ck.gameTitle, { name })}</h2>
              {facts ? <p className="summary__meta">{facts}</p> : null}
              {purchase ? <p className="summary__meta">{tf(t.worldPurchase.frozenAge, { age: summary.child?.ageYears ?? "" })}</p> : null}
            </div>
            {purchase ? null : (
              <a className="summary__edit" href={creationDraftHref("name", draft.id)} aria-label={draft.searchLevel ? ck.editChildLevel : ck.editChild}>
                <Icon name="pencil" />
                {ck.edit}
              </a>
            )}
          </div>
          {worlds.map((world) => (
            <div key={world.slug} className="summary__world">
              <WorldEmblem slug={world.slug} className="summary__emblem" />
              <div className="summary__lines">
                <h3 className="summary__world-name">{pick(world.name, locale)}</h3>
                {worlds.length === 1 ? <p className="summary__meta">{tf(ck.summaryLine, { boards: shape.places, spots: shape.spots })}</p> : null}
              </div>
            </div>
          ))}
          {worlds.length > 1 ? <p className="summary__meta">{tf(ck.summaryLine, { boards: shape.places, spots: shape.spots })}</p> : null}
          <p className="summary__included"><Icon name="check" strokeWidth={3} />{t.home.pricing.passport}</p>
          {continuation ? <p className="summary__meta">{tf(t.home.pricing.returning, { price: formatMoney(WORLD_PRICES[currency].additional, currency, locale) })}</p> : null}
          <div className="summary__total">
            <span>{ck.total}</span>
            <span className="summary__price"><strong>{price}</strong><small>{ck.vat}</small></span>
          </div>
        </section>
        <div className="summary__side">
          <CheckoutForm
            defaultEmail={defaultEmail}
            priceLabel={price}
            outcome={outcome}
            gameId={purchase ? draft.id : undefined}
            draftGameId={purchase ? undefined : draft.id}
            lockedEmail={Boolean(purchase)}
          />
          {user && lastOrder?.userId === user.id && outstandingCheckout(lastOrder) ? <ClosePaymentForm gameId={draft.id} orderId={lastOrder.id} /> : null}
        </div>
      </div>
      <div className="summary__back">
        <LinkButton href={backHref} variant="ghost">
          <span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden />
          {backLabel}
        </LinkButton>
      </div>
    </CreateFrame>
  );
}
