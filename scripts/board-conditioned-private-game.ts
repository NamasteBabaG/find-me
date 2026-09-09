/**
 * Free: turn finished board-engine runs into one private review game.
 *
 * Every board is replayed from its own cached checkpoints - no provider, no
 * credential, no ledger write - then passed through the SAME player adapter the
 * product uses, so the geometry, masks and occlusion are re-proved here rather
 * than trusted from a stored summary. Nothing is published: the result is a
 * private review config plus its exact raster assets on disk.
 *
 *   npx tsx scripts/board-conditioned-private-game.ts \
 *     --runs=antarctica-operational-v1 --child="Yuval" --out=work/private-game-20260909
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { cachedOnlyDependencies } from "./board-conditioned-probe-replay";
import { prepareBoardConditionedSource } from "../src/services/generation/board-conditioned-source";
import { generateBoardConditionedAppearances, type BoardGenerationDependencies } from "../src/services/generation/board-conditioned-generation";
import { prepareBoardConditionedPlayerBoard, bindBoardConditionedPlayerGame, type BoardConditionedPrivateUrlReceipt } from "../src/services/generation/board-conditioned-player";
import { PrismaBoardConditionedCheckpointStore } from "../src/infra/db/board-conditioned-checkpoints";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { GameConfigSchema, type GameConfig } from "../src/domain/game/config";

const ENGINE_ROOT = "work/board-conditioned-engine-20260909";

function flag(name: string, fallback = ""): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** A one-board scene the private review renderer can mount, three targets each. */
function scene(boardId: string, title: string, width: number, height: number) {
  return {
    slug: boardId, version: 1, name: title, tagline: "Private review", artStatus: "final" as const,
    art: { width, height, base: `/private/${boardId}/board.png`, thumbnail: `/private/${boardId}/board.png`,
      palette: { sky: "#DCE9F5", ground: "#B9A98F", accent: "#F5B301" } },
    targets: [0, 1, 2].map(i => ({
      id: `${boardId}-target-${i}`, targetType: "board-conditioned", difficulty: i + 1,
      mission: "Find the hidden child", item: "The hidden child", success: ["Found!"], animation: "peek" as const,
      // Placeholder A/B slots: the adapter replaces them with the real frozen
      // placement, but the shared GameConfig schema requires the pair to exist.
      slots: [0, 1].map(n => ({ id: `${boardId}-target-${i}-${n === 0 ? "a" : "b"}`, x: .5, y: .5, scale: .2,
        hintZone: { x: .5, y: .5, r: .1 }, hintText: "Placeholder" })),
      sprite: { kind: "image" as const, url: "/private/placeholder.png", width: 10, height: 10 },
    })),
    ambient: [], celebration: { kind: "stars" as const, completeText: "Well done" },
    collectible: { id: boardId, name: title, icon: "star" },
  };
}

async function main() {
  const runIds = flag("runs").split(",").map(s => s.trim()).filter(Boolean);
  const childName = flag("child", "Yuval");
  const out = path.resolve(flag("out", "work/private-game-20260909"));
  if (!runIds.length) throw new Error("--runs is required");
  if (runIds.some(id => !/^[a-z0-9-]{3,70}$/.test(id))) throw new Error("Safe run IDs required");
  mkdirSync(out, { recursive: true });

  const boards = [];
  const receipts: BoardConditionedPrivateUrlReceipt[] = [];
  const targetSlots = [];
  const scenes = [];

  for (const runId of runIds) {
    const root = path.join(ENGINE_ROOT, runId);
    const plan = JSON.parse(readFileSync(path.join(root, "plan.json"), "utf8"));
    const specPath = runIds.length === 1 && flag("spec") ? flag("spec") : path.join(ENGINE_ROOT, `${runId}-spec.json`);
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const input = (await loadBoardConditioningInputs(spec))[0]!;
    const sourcePolicy = plan.sourcePolicy as BoardGenerationDependencies["sourcePolicy"];
    const observerPolicy = plan.observerPolicy as BoardGenerationDependencies["observerPolicy"];
    const prepared = await prepareBoardConditionedSource(input, sourcePolicy);
    if (prepared.contractSha256 !== plan.contractSha256) throw new Error(`${runId}: frozen contract changed; refusing to build a game from it`);

    const dbFile = path.resolve(root, "engine.sqlite");
    const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
    let request;
    try {
      const store = new PrismaWorldBudgetStore(db), checkpoints = new PrismaBoardConditionedCheckpointStore(db);
      const deps = cachedOnlyDependencies({ sourcePolicy, observerPolicy, store, checkpoints });
      const result = await generateBoardConditionedAppearances(deps, { worldId: `probe:${runId}`, input, expectedContractSha256: prepared.contractSha256 });
      if (result.state !== "review-required") throw new Error(`${runId}: replay state ${result.state}; only a fully composed board can enter the player`);
      const blocked = result.appearances.filter(a => a.state !== "visual-review-required").map(a => a.slotId);
      if (blocked.length) throw new Error(`${runId}: ${blocked.length} appearance(s) not composed: ${blocked.join(", ")}`);
      request = { worldId: `probe:${runId}`, input, sourcePolicy, observerPolicy, expectedContractSha256: prepared.contractSha256, result };
    } finally { await db.$disconnect(); }

    // The same adapter the product uses: it re-runs extraction, the lower-cut
    // search and the full composition replay before anything becomes an asset.
    const exported = await prepareBoardConditionedPlayerBoard(request);
    const dir = path.join(out, "assets", input.boardId);
    mkdirSync(dir, { recursive: true });
    for (const write of exported.assetWrites) {
      const file = path.join(dir, `${write.key.replace(/[^A-Za-z0-9_.-]/g, "_")}.png`);
      writeFileSync(file, write.png);
      receipts.push({ key: write.key, sha256: write.sha256, rgbaSha256: write.rgbaSha256, width: write.width, height: write.height,
        url: `/private/${input.boardId}/${path.basename(file)}`, access: "authenticated-private" });
    }
    boards.push(request);
    const boardAsset = exported.assetWrites.find(a => a.kind === "static-board")!;
    scenes.push(scene(input.boardId, input.boardId, boardAsset.width, boardAsset.height));
    for (const [i, placement] of exported.manifest.placements.entries()) {
      targetSlots.push({ boardId: input.boardId, targetId: `${input.boardId}-target-${i}`, slotId: placement.slotId, hintText: `Look for the hidden child near ${placement.slotId}` });
    }
    console.log(`${runId}: ${exported.manifest.placements.length} placements, ${exported.assetWrites.length} assets`);
  }

  const avatarDir = path.join(out, "assets", "profile");
  mkdirSync(avatarDir, { recursive: true });
  writeFileSync(path.join(avatarDir, "avatar.png"), boards[0]!.input.child.illustratedIdentity.png);
  const template: GameConfig = GameConfigSchema.parse({
    version: 1, gameId: "private-board-conditioned-review", locale: "en",
    child: { name: childName, avatarUrl: "/private/profile/avatar.png" },
    styleVersion: "fixed-sprite-board-conditioned-v1", packageTier: "ONE_WORLD",
    composedAt: "2026-09-09T00:00:00.000Z", scenes,
  });

  const game = await bindBoardConditionedPlayerGame({ boards, template, targetSlots, receipts, mode: "private-review",
    privateProbeScopes: boards.map(b => ({ boardId: b.input.boardId, sourceWorldId: b.worldId })) });
  writeFileSync(path.join(out, "private-review-config.json"), JSON.stringify(game.privateReviewConfig, null, 2));
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify({
    builtFrom: runIds, scope: game.scope, automaticRelease: game.automaticRelease,
    persistenceStatus: game.persistenceStatus, semanticStatus: game.semanticStatus,
    browserPixelParity: game.browserPixelParity, playable: game.playableGameConfig !== null,
  }, null, 2));
  console.log(JSON.stringify({ out, boards: boards.length, scope: game.scope, playable: game.playableGameConfig !== null,
    semanticStatus: game.semanticStatus, automaticRelease: game.automaticRelease }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
