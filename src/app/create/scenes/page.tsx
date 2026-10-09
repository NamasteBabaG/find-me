import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { sceneVersionForLevel, worldsForDraft } from "@/services/create-flow.service";
import { storedSearchLevel } from "@/domain/search-level";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { PACKAGES, isPackageTier } from "@/domain/package";
import { boardSlugs } from "@/domain/world";
import { getI18n } from "@/i18n/server";
import { pick, tf } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "@/lib/server/current-draft";
import { ScenePicker } from "./ScenePicker";
import { boardPresentation, presentationMatchesScene } from "../../../../content/home/board-presentation";
import { findScene } from "../../../../content/scenes";

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
  const level = storedSearchLevel(draft.searchLevel);
  const version = sceneVersionForLevel(draft.styleVersion, level);
  if (version === null) redirect("/create");
  const worlds = await worldsForDraft(c, draft.styleVersion, level);
  // Said where worlds are chosen: a world without its own Detectives boards is not on this list.
  const explorersOnly = level === "detectives"
    ? (await worldsForDraft(c, draft.styleVersion, "explorers")).filter(w => !worlds.some(d => d.slug === w.slug)).map(w => pick(w.name, locale))
    : [];
  const heldBoards = new Set(draft.scenes.map((s) => s.sceneSlug));
  const chosen = worlds.filter((w) => boardSlugs(w).every((slug) => heldBoards.has(slug)));

  // Nothing to choose: the package takes every world there is, and the package
  // step already stored that selection. Rendering a page must never write, so we
  // only skip ahead when the draft is already complete; otherwise the picker posts it.
  if (worlds.length === want && chosen.length === want) redirect("/checkout");

  const options = worlds.map((w) => {
    const slug = boardSlugs(w)[0]!;
    const scene = findScene(slug, version);
    return {
    slug: w.slug,
    name: pick(w.name, locale),
    tagline: pick(w.tagline, locale),
    thumbnail: presentationMatchesScene(slug, scene?.art) ? boardPresentation(slug)!.thumbnail : scene?.art.thumbnail ?? w.map.artPortrait ?? w.map.art,
  }; });
  return (
    <CreateFrame width="mid" step={3} title={t.create.scenes.title} lead={t.create.scenes.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <ScenePicker note={explorersOnly.length ? tf(t.create.scenes.explorersOnly, { worlds: explorersOnly.join(", ") }) : undefined} key={`${want}:${chosen.map(w => w.slug).join(",")}`} scenes={options} want={want} preselected={chosen.map((w) => w.slug)} />
    </CreateFrame>
  );
}
