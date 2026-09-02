import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { activeScenes } from "@/services/scene-catalog.service";
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
  const scenes = (await activeScenes(c)).map((s) => ({ slug: s.slug, name: pick(s.name, locale), tagline: pick(s.tagline, locale), thumbnail: s.art.thumbnail }));
  const preselected = draft.scenes.map((s) => s.sceneSlug);
  return (
    <CreateFrame step={3} title={t.create.scenes.title} lead={t.create.scenes.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <ScenePicker scenes={scenes} want={want} preselected={preselected} />
    </CreateFrame>
  );
}
