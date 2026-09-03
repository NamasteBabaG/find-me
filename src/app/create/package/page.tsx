import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { availablePackages } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, PACKAGE_ORDER, priceFor, searchesFor, type PackageTier } from "@/domain/package";
import { getCurrency, getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { PackagePicker } from "./PackagePicker";

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
  const available = new Set((await availablePackages(c)).map((p) => p.tier));
  // Only tiers that can actually be bought right now (enough active worlds) are shown.
  const options = PACKAGE_ORDER.filter((tier) => available.has(tier)).map((tier) => {
    const p = PACKAGES[tier];
    return {
      tier,
      name: pick(p.name, locale),
      sceneCount: p.sceneCount,
      meta: tf(t.create.package.spots, { n: searchesFor(tier), time: pick(p.playtime, locale) }),
      price: formatMoney(priceFor(tier, currency), currency, locale),
      popular: p.popular,
    };
  });
  const fallbackTier = available.has("BIG") ? "BIG" : (options[0]?.tier ?? "SMALL");
  const defaultTier = draft.packageTier && available.has(draft.packageTier as PackageTier) ? draft.packageTier : fallbackTier;
  return (
    <CreateFrame step={2} title={t.create.package.title} lead={tf(t.create.package.lead, { name: draft.childProfile.displayName })} user={user} isAdmin={isAdminEmail(user?.email)}>
      <PackagePicker options={options} defaultTier={defaultTier} />
    </CreateFrame>
  );
}
