import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { activeScenes } from "@/services/scene-catalog.service";
import { selectScenes } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, isPackageTier } from "@/domain/package";
import { getI18n } from "@/i18n/server";
import { pick } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { ScenePicker } from "./ScenePicker";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.scenes.title };
}

export default async function CreateScenesPage() {
  const c = getContainer();
  const [user, draft, { t, locale }] = await Promise.all([currentUser(), currentDraft(), getI18n()]);
  if (!draft?.childProfile) redirect("/create");
  if (!draft.packageTier || !isPackageTier(draft.packageTier)) redirect("/create/package");
  const want = PACKAGES[draft.packageTier].sceneCount;
  const active = await activeScenes(c);
  const preselected = draft.scenes.map((s) => s.sceneSlug);

  // Nothing to choose: the package takes every active world. Select them all and go straight to checkout.
  if (active.length === want) {
    const all = active.map((s) => s.slug);
    const alreadySelected = preselected.length === want && all.every((slug) => preselected.includes(slug));
    if (alreadySelected || (await selectScenes(c, draft.id, all)).ok) redirect("/checkout");
  }

  const scenes = active.map((s) => ({ slug: s.slug, name: pick(s.name, locale), tagline: pick(s.tagline, locale), thumbnail: s.art.thumbnail }));
  return (
    <CreateFrame step={3} title={t.create.scenes.title} lead={t.create.scenes.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <ScenePicker scenes={scenes} want={want} preselected={preselected} />
    </CreateFrame>
  );
}
