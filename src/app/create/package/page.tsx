import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { availablePackages } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, PACKAGE_ORDER, formatPriceILS, searchesFor } from "@/domain/package";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { PackagePicker } from "./PackagePicker";

export const metadata = { title: "כמה עולמות?" };

export default async function CreatePackagePage() {
  const c = getContainer();
  const [user, draft] = await Promise.all([currentUser(), currentDraft()]);
  if (!draft?.childProfile) redirect("/create");
  if (!draft.childProfile.originalPhotoAssetId) redirect("/create/photo");
  const available = new Set((await availablePackages(c)).map((p) => p.tier));
  const options = PACKAGE_ORDER.map((tier) => {
    const p = PACKAGES[tier];
    return { tier, name: p.name, sceneCount: p.sceneCount, searches: searchesFor(tier), price: formatPriceILS(p.priceAgorot), playtime: p.playtime, popular: p.popular, available: available.has(tier) };
  });
  const defaultTier = draft.packageTier ?? (available.has("BIG") ? "BIG" : "SMALL");
  return (
    <CreateFrame step={2} title="כמה עולמות?" lead={`בכל עולם ${draft.childProfile.displayName} מתחבא/ת שלוש פעמים. ההבדל היחיד הוא הכמות.`} user={user} isAdmin={isAdminEmail(user?.email)}>
      <PackagePicker options={options} defaultTier={defaultTier} />
    </CreateFrame>
  );
}
