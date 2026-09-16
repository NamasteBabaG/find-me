import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { availablePackages } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, PACKAGE_ORDER, boardsFor, priceFor, type PackageTier } from "@/domain/package";
import { getCurrency, getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { PackagePicker } from "./PackagePicker";
import { LOCAL_PATCH_STYLE } from "@/services/generation/local-patch-world";
import { purchasableWorldSlugs } from "@/services/world-catalog.service";
import { COLLECTION_SCENE_VERSION, localPatchHidesPerBoard } from "@/domain/scene/local-patch-catalog";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.package.title };
}

export default async function CreatePackagePage() {
  const c = getContainer();
  const [user, draft, { t, locale }] = await Promise.all([currentUser(), currentDraft(), getI18n()]);
  if (!draft?.childProfile) redirect("/create");
  if (!draft.childProfile.originalPhotoAssetId) redirect("/create/photo");
  const currency = await getCurrency();
  const [packages, worldSlugs] = await Promise.all([availablePackages(c), purchasableWorldSlugs(c)]);
  const available = new Set(packages.map((p) => p.tier));
  const availableWorldCount = worldSlugs.length;
  // Package selection re-enrolls editable QA drafts in this same release.
  // Historical purchased games remain pinned and never use this page.
  const spotsPerBoard = draft.styleVersion === LOCAL_PATCH_STYLE ? localPatchHidesPerBoard(COLLECTION_SCENE_VERSION) : 3;
  // Only tiers that can actually be bought right now (enough active worlds) are shown.
  const options = PACKAGE_ORDER.filter((tier) => available.has(tier)).map((tier) => {
    const p = PACKAGES[tier];
    return {
      tier,
      name: pick(p.name, locale),
      worldCount: p.worldCount,
      boardCount: boardsFor(tier),
      meta: tf(t.create.package.spots, { n: boardsFor(tier) * spotsPerBoard }),
      price: formatMoney(priceFor(tier, currency), currency, locale),
      popular: p.popular,
    };
  });
  const fallbackTier = available.has("TWO_WORLDS") ? "TWO_WORLDS" : (options[0]?.tier ?? "ONE_WORLD");
  const defaultTier = draft.packageTier && available.has(draft.packageTier as PackageTier) ? draft.packageTier : fallbackTier;
  return (
    <CreateFrame width="mid" step={2} title={t.create.package.title} lead={tf(t.create.package.lead, { name: draft.childProfile.displayName, spots: spotsPerBoard })} user={user} isAdmin={isAdminEmail(user?.email)}>
      <PackagePicker options={options} defaultTier={defaultTier} availableWorldCount={availableWorldCount} />
    </CreateFrame>
  );
}
