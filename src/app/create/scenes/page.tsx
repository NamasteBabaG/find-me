import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { activeScenes } from "@/services/scene-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, isPackageTier } from "@/domain/package";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { ScenePicker } from "./ScenePicker";

export const metadata = { title: "אילו עולמות?" };

export default async function CreateScenesPage() {
  const c = getContainer();
  const [user, draft] = await Promise.all([currentUser(), currentDraft()]);
  if (!draft?.childProfile) redirect("/create");
  if (!draft.packageTier || !isPackageTier(draft.packageTier)) redirect("/create/package");
  const want = PACKAGES[draft.packageTier].sceneCount;
  const scenes = (await activeScenes(c)).map((s) => ({ slug: s.slug, name: s.name, tagline: s.tagline, thumbnail: s.art.thumbnail }));
  const preselected = draft.scenes.map((s) => s.sceneSlug);
  return (
    <CreateFrame step={3} title="אילו עולמות?" lead="בחרנו מראש. אפשר פשוט להמשיך, או להחליף." user={user} isAdmin={isAdminEmail(user?.email)}>
      <ScenePicker scenes={scenes} want={want} preselected={preselected} />
    </CreateFrame>
  );
}
