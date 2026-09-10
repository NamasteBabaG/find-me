import { GameConfigSchema, SceneConfigSchema, type SceneConfig } from "../../domain/game/config";
import { composeGame } from "../../domain/game/compose";

export interface PartialWizardReviewRecord {
  gameId: string;
  ownerId: string;
  state: string;
  automaticRelease: false;
  childName: string;
  avatarAssetId: string;
  boards: readonly {
    boardId: string;
    state: string;
    assetIds: readonly string[];
    playerBindingSha256?: string;
    visual: readonly { patchAssetId: string }[];
  }[];
}

/** Read-only, private QA projection of retained scenes. Never writes/publishes a
 * game, generates assets, waives a failed board, or claims visual approval. */
export function composePartialBoardWizardReview(input: {
  gameId: string;
  ownerId: string;
  locale: string;
  styleVersion: string;
  record: PartialWizardReviewRecord;
  scenes: readonly {
    gameId: string;
    sceneSlug: string;
    sceneVersion: number;
    orderIndex: number;
    generationStatus: string;
    configJson: string | null;
  }[];
  composedAt: Date;
}) {
  const { record } = input;
  if (record.gameId !== input.gameId || record.ownerId !== input.ownerId || record.automaticRelease !== false
    || !["held", "review-required"].includes(record.state)) return null;
  const scenes: SceneConfig[] = [], seen = new Set<string>();
  for (const stored of [...input.scenes].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const progress = record.boards.find(b => b.boardId === stored.sceneSlug);
    if (stored.gameId !== input.gameId || stored.generationStatus !== "GENERATED" || !stored.configJson
      || progress?.state !== "geometry-ok" || !progress.playerBindingSha256 || seen.has(stored.sceneSlug)) continue;
    let json: unknown;
    try { json = JSON.parse(stored.configJson); } catch { continue; }
    const parsed = SceneConfigSchema.safeParse(json);
    if (!parsed.success) continue;
    const scene = parsed.data;
    if (scene.slug !== stored.sceneSlug || scene.version !== stored.sceneVersion || scene.targets.length !== 3 || scene.art.foreground) continue;
    const privateUrls = new Set(progress.assetIds.map(id => `/api/assets/${id}`));
    const expectedTargets = new Set(progress.visual.map(v => `/api/assets/${v.patchAssetId}`));
    if (expectedTargets.size !== 3 || !privateUrls.has(scene.art.base) || expectedTargets.has(scene.art.base)) continue;
    const actualTargets = new Set<string>();
    if (!scene.targets.every(t => {
      if (t.sprite.kind !== "image" || !privateUrls.has(t.sprite.url) || !expectedTargets.has(t.sprite.url)) return false;
      const url = t.sprite.url;
      actualTargets.add(url);
      return Object.values(t.spriteByVariant ?? {}).every(v => !v || v.kind === "image" && v.url === url);
    }) || actualTargets.size !== 3) continue;
    // A partial preview uses the existing board list, not a nine-node map whose
    // missing destinations would suggest a finished world or broken navigation.
    const { worldSlug: _worldSlug, ...partialScene } = scene;
    scenes.push(partialScene); seen.add(scene.slug);
  }
  if (scenes.length === 0) return null;
  return GameConfigSchema.parse(composeGame({ gameId: input.gameId,
    child: { name: record.childName, avatarUrl: `/api/assets/${record.avatarAssetId}` },
    packageTier: "ONE_WORLD", styleVersion: input.styleVersion,
    locale: input.locale === "he" ? "he" : "en", scenes, now: input.composedAt,
  }));
}
