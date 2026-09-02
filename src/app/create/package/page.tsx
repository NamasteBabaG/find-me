import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { availablePackages } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, PACKAGE_ORDER, priceFor, searchesFor } from "@/domain/package";
import { getI18n } from "@/i18n/server";
import { currencyFor, formatMoney, pick, tf } from "@/i18n";
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
  const available = new Set((await availablePackages(c)).map((p) => p.tier));
  const options = PACKAGE_ORDER.map((tier) => {
    const p = PACKAGES[tier];
    return {
      tier,
      name: pick(p.name, locale),
      sceneCount: p.sceneCount,
      meta: tf(t.create.package.spots, { n: searchesFor(tier), time: pick(p.playtime, locale) }),
      price: formatMoney(priceFor(tier, currencyFor(locale)), currencyFor(locale), locale),
      popular: p.popular,
      available: available.has(tier),
    };
  });
  const defaultTier = draft.packageTier ?? (available.has("BIG") ? "BIG" : "SMALL");
  return (
    <CreateFrame step={2} title={t.create.package.title} lead={tf(t.create.package.lead, { name: draft.childProfile.displayName })} user={user} isAdmin={isAdminEmail(user?.email)}>
      <PackagePicker options={options} defaultTier={defaultTier} />
    </CreateFrame>
  );
}
