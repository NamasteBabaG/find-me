import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { availablePackages, sceneVersionForLevel, searchLevelTerms, worldsForDraft } from "@/services/create-flow.service";
import { storedSearchLevel } from "@/domain/search-level";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, PACKAGE_ORDER, WORLD_PRICES, boardsFor, priceFor, type PackageTier } from "@/domain/package";
import { childHasPaidWorld } from "@/services/child-pricing.service";
import { getCurrency, getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "@/lib/server/current-draft";
import { PackagePicker } from "./PackagePicker";
import { LOCAL_PATCH_STYLE } from "@/services/generation/local-patch-world";
import { COLLECTION_SCENE_VERSION, localPatchHidesPerBoard } from "@/domain/scene/local-patch-catalog";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.package.title };
}

export default async function CreatePackagePage() {
  const c = getContainer();
  const [user, draft, { t, locale }, currency] = await Promise.all([currentUser(), currentDraft(), getI18n(), getCurrency()]);
  if (!draft?.childProfile) redirect("/create");
  if (!draft.childProfile.originalPhotoAssetId) redirect("/create/photo");
  const level = storedSearchLevel(draft.searchLevel);
  // A level that can no longer be sold goes back to the choice, never to other boards;
  // an open payment keeps its own terms.
  const terms = await searchLevelTerms(c, draft);
  if (sceneVersionForLevel(draft.styleVersion, level) === null || terms.stale && !terms.openPayment) redirect("/create");
  const [worlds, continuation] = await Promise.all([
    worldsForDraft(c, draft.styleVersion, level),
    user && user.id === draft.ownerId ? childHasPaidWorld(c.db, { ownerId: user.id, familyChildId: draft.familyChildId, excludeGameId: draft.id }) : false,
  ]);
  const packages = await availablePackages(c, draft.styleVersion, worlds.length, level);
  const available = new Set(packages.map((p) => p.tier));
  const availableWorldCount = worlds.length;
  // Package selection re-enrolls editable QA drafts in this same release.
  // Historical purchased games remain pinned and never use this page.
  const spotsPerBoard = draft.styleVersion === LOCAL_PATCH_STYLE ? localPatchHidesPerBoard(COLLECTION_SCENE_VERSION) : 3;
  // Only tiers that can actually be bought right now (enough active worlds) are shown.
  const options = PACKAGE_ORDER.filter((tier) => available.has(tier)).map((tier) => {
    const p = PACKAGES[tier];
    return {
      tier,
      name: continuation && tier === "ONE_WORLD" ? t.home.pricing.additionalTitle : pick(p.name, locale),
      worldCount: p.worldCount,
      boardCount: boardsFor(tier),
      meta: tf(t.create.package.spots, { n: boardsFor(tier) * spotsPerBoard }),
      price: formatMoney(priceFor(tier, currency, continuation), currency, locale),
      popular: p.popular,
    };
  });
  const fallbackTier = available.has("TWO_WORLDS") ? "TWO_WORLDS" : (options[0]?.tier ?? "ONE_WORLD");
  const defaultTier = draft.packageTier && available.has(draft.packageTier as PackageTier) ? draft.packageTier : fallbackTier;
  return (
    <CreateFrame width="mid" step={2} title={t.create.package.title} lead={tf(t.create.package.lead, { name: draft.childProfile.displayName, spots: spotsPerBoard })} user={user} isAdmin={isAdminEmail(user?.email)}>
      <PackagePicker options={options} defaultTier={defaultTier} availableWorldCount={availableWorldCount}
        continuationNote={tf(continuation ? t.home.pricing.returning : t.home.pricing.continuation, { price: formatMoney(WORLD_PRICES[currency].additional, currency, locale) })} />
    </CreateFrame>
  );
}
