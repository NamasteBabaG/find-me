import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { purchasableWorlds } from "@/services/world-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, isPackageTier } from "@/domain/package";
import { boardSlugs } from "@/domain/world";
import { getI18n } from "@/i18n/server";
import { pick } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { ScenePicker } from "./ScenePicker";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.scenes.title };
}

/** Which worlds. Each one brings its nine boards, so this step counts journeys, not boards. */
export default async function CreateScenesPage() {
  const c = getContainer();
  const [user, draft, { t, locale }] = await Promise.all([currentUser(), currentDraft(), getI18n()]);
  if (!draft?.childProfile) redirect("/create");
  if (!draft.packageTier || !isPackageTier(draft.packageTier)) redirect("/create/package");
  const want = PACKAGES[draft.packageTier].worldCount;
  const worlds = await purchasableWorlds(c);
  const heldBoards = new Set(draft.scenes.map((s) => s.sceneSlug));
  const chosen = worlds.filter((w) => boardSlugs(w).every((slug) => heldBoards.has(slug)));

  // Nothing to choose: the package takes every world there is, and the package
  // step already stored that selection. Rendering a page must never write, so we
  // only skip ahead when the draft is already complete; otherwise the picker posts it.
  if (worlds.length === want && chosen.length === want) redirect("/checkout");

  const options = worlds.map((w) => ({
    slug: w.slug,
    name: pick(w.name, locale),
    tagline: pick(w.tagline, locale),
    thumbnail: w.map.artPortrait ?? w.map.art,
  }));
  return (
    <CreateFrame step={3} title={t.create.scenes.title} lead={t.create.scenes.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <ScenePicker scenes={options} want={want} preselected={chosen.map((w) => w.slug)} />
    </CreateFrame>
  );
}
