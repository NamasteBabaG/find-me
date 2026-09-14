import { GameConfigSchema, type GameConfig, type SceneConfig, type SpriteRef } from "../game/config";
import { AdventureBookSchema, type AdventureBook } from "./book-schema";
import { AdventureCatalogSchema, contains, overlaps, type AdventureCatalog, type AdventureRect, type ReadyAdventureBoard } from "./content";
import { bindBookImage, gameAssetId } from "./image-binding";

/** Machine-readable failures; UI copy belongs to i18n, not this layer. */
export class AdventureError extends Error {
  constructor(public readonly code: "not-ready" | "not-owned" | "content-mismatch" | "unsafe-layout" | "invalid-event" | "wrong-book" | "corrupt-progress", public readonly subject?: string) {
    super(`adventure:${code}${subject ? `:${subject}` : ""}`);
  }
}

function imagePatch(sprite: SpriteRef, subject: string) {
  if (sprite.kind !== "image" || !sprite.rect || !sprite.hitRect) throw new AdventureError("unsafe-layout", subject);
  return sprite as Extract<SpriteRef, { kind: "image" }> & { rect: AdventureRect; hitRect: AdventureRect };
}

function checkBoard(scene: SceneConfig, plan: ReadyAdventureBoard) {
  if (scene.artStatus !== "final" || scene.version !== plan.sceneVersion || scene.art.width !== plan.art.width || scene.art.height !== plan.art.height || scene.art.base !== plan.art.base || scene.worldSlug !== plan.worldSlug) throw new AdventureError("content-mismatch", scene.slug);
  // Explicit fixed, resumable three/four/five-hide contract. All remain serial on screen.
  // Legacy three-hide replay/composed sprites need their own content review.
  if (scene.playMode !== "find-any" || scene.findsRequiredToAdvance !== 3) throw new AdventureError("not-ready", scene.slug);
  if (plan.collectionUi === "guided-v1" && scene.targets.length !== plan.plannedHides) throw new AdventureError("content-mismatch", `${scene.slug}:hide-count`);
  if (scene.art.foreground) throw new AdventureError("unsafe-layout", `${scene.slug}:foreground-needs-discovery-review`);
  for (const target of scene.targets) {
    if (target.adjust && (target.adjust.dx !== 0 || target.adjust.dy !== 0 || target.adjust.scale !== 1)) throw new AdventureError("unsafe-layout", target.id);
    const sprites = [target.sprite, ...Object.values(target.spriteByVariant ?? {})];
    if (target.slots.some(s => s.flip || s.rotation !== 0)) throw new AdventureError("unsafe-layout", target.id);
    for (const sprite of sprites) {
      if (!sprite) continue;
      const patch = imagePatch(sprite, target.id);
      if (!contains(patch.rect, patch.hitRect)) throw new AdventureError("unsafe-layout", `${target.id}:hit-outside-patch`);
      if (!plan.personalZones.some(zone => contains(zone, patch.rect))) throw new AdventureError("unsafe-layout", target.id);
      if (plan.discoveries.some(d => overlaps(d.cardCrop, patch.rect))) throw new AdventureError("unsafe-layout", target.id);
      if (target.id === plan.postcard.targetId && !contains(plan.postcard.crop, patch.hitRect)) throw new AdventureError("unsafe-layout", `${target.id}:postcard-cuts-child`);
    }
  }
  if (!scene.targets.some(t => t.id === plan.postcard.targetId)) throw new AdventureError("content-mismatch", plan.postcard.targetId);
  // Existing interactive decorations may paint over or steal taps from a discovery.
  if (plan.discoveries.some(d => scene.ambient.some(a => overlaps(d.cardCrop, { x: a.x, y: a.y, w: a.w, h: a.h }))) || scene.bonus) throw new AdventureError("unsafe-layout", `${scene.slug}:interactive-overlap`);
}

/**
 * Explicit opt-in after art review. No catalog import from the live creation path.
 * Compiles only requested, actually shipped boards; drafts can never activate.
 * Art hashes come from the authored manifest; the authoring validator separately
 * verifies their bytes. This pure function does NOT claim to hash an image.
 */
export function attachAdventureBook(input: GameConfig, raw: AdventureCatalog, boardSlugs: readonly string[]): GameConfig {
  const config = GameConfigSchema.parse(input);
  if (config.adventure) throw new AdventureError("content-mismatch", "existing-book-is-immutable");
  const catalog = AdventureCatalogSchema.parse(raw);
  const avatarAssetId = gameAssetId(config.child.avatarUrl);
  if (!avatarAssetId) throw new AdventureError("not-ready", "published-avatar-required");
  if (!boardSlugs.length || new Set(boardSlugs).size !== boardSlugs.length) throw new AdventureError("content-mismatch", "board-selection");
  const boards: AdventureBook["boards"] = boardSlugs.map(slug => {
    const scene = config.scenes.find(s => s.slug === slug);
    if (!scene) throw new AdventureError("not-owned", slug);
    const plan = catalog.boards.find(b => b.boardSlug === slug);
    if (!plan || plan.status !== "ready") throw new AdventureError("not-ready", slug);
    checkBoard(scene, plan);
    return {
      boardSlug: slug, worldSlug: plan.worldSlug, sceneVersion: scene.version, artSha256: plan.art.sha256,
      art: { base: scene.art.base, width: scene.art.width, height: scene.art.height },
      targetIds: scene.targets.map(t => t.id), findsRequiredToAdvance: 3,
      ...(plan.collectionUi ? { collectionUi: plan.collectionUi } : {}),
      targetImages: scene.targets.map(t => {
        const A = bindBookImage(t.spriteByVariant?.A ?? t.sprite), B = bindBookImage(t.spriteByVariant?.B ?? t.sprite);
        if (!A || !B) throw new AdventureError("not-ready", `${t.id}:published-patch-required`);
        return { targetId: t.id, A, B };
      }),
      discoveries: plan.discoveries.map(d => ({
        id: d.id, name: d.name[config.locale], hint: d.hint[config.locale], category: d.category,
        ...(d.rarity ? { rarity: d.rarity } : {}),
        ...(d.difficulty ? { difficulty: d.difficulty } : {}),
        description: d.description.text[config.locale], descriptionKind: d.description.kind,
        ...(d.description.kind === "fact" ? { sourceUrl: d.description.sourceUrl } : {}),
        hitRect: d.hitRect, cardCrop: d.cardCrop,
      })),
      postcard: { ...plan.postcard, title: plan.postcard.title[config.locale] },
    };
  });
  const adventure = AdventureBookSchema.parse({ version: 1, releaseId: catalog.releaseId, avatarAssetId, mode: "serial-collection-v1", boards });
  return GameConfigSchema.parse({ ...config, adventure });
}
