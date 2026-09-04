/**
 * What is happening to one game, and why.
 *
 *   npx tsx scripts/game-status.ts <gameId> [--rejects=work/rejects]
 *
 * Prints the game and job state, every hiding spot with its rolls, spend and
 * rejection reason, and the totals. With `--rejects` it also writes out the
 * renders that were thrown away, because a reason says a roll was wrong and only
 * the picture says how — the model painted an adult, or a second child, or
 * repainted the whole crop, or put her somewhere the diff could not find her.
 *
 * With `--scales` it re-measures every rejected render this game already paid
 * for and reports, per spot, how big the model actually painted the child
 * against how big the slot asked. A spot that is consistently off is not a bad
 * model — it is a slot whose `scale` disagrees with the board's own perspective,
 * and the suggested value is printed.
 *
 * Read-only apart from those files. Reads whatever DATABASE_URL points at, so
 * against production it needs a production URL in the environment.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Tiny .env loader, same as the smoke script: only fills what is not already set.
for (const line of readFileSync(path.resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/.exec(line);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").trim();
}

function flag(name: string, fallback = ""): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const gameId = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!gameId) throw new Error("usage: npx tsx scripts/game-status.ts <gameId> [--rejects=work/rejects]");

  const { getContainer } = await import("../src/services/container");
  const { readAssetBuffer } = await import("../src/services/asset.service");
  const c = getContainer();

  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  if (!game) throw new Error(`no game ${gameId}`);
  const job = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
  const jobAge = job ? `${Math.round((Date.now() - job.updatedAt.getTime()) / 1000)}s ago` : "never";

  console.log(`${gameId}  ${game.childProfile?.displayName ?? "?"}  ${game.packageTier ?? "?"}  ${game.scenes.length} worlds`);
  console.log(`status ${game.status}   job ${job?.status ?? "none"} (${job?.currentStep ?? "-"}, touched ${jobAge})`);
  if (game.lastError) console.log(`lastError: ${game.lastError}`);

  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true } } } } },
    orderBy: [{ targetInstance: { gameScene: { orderIndex: "asc" } } }, { createdAt: "asc" }],
  });

  console.log("");
  let rolls = 0;
  let cents = 0;
  let done = 0;
  const rejectDir = flag("rejects");
  if (rejectDir) mkdirSync(path.resolve(process.cwd(), rejectDir), { recursive: true });
  for (const r of rows) {
    const name = `${r.targetInstance.gameScene.sceneSlug}/${r.targetInstance.targetId}/${r.variant}`;
    console.log(`${name.padEnd(28)} ${r.status.padEnd(10)} ${String(r.attempts).padStart(2)} rolls  ${(r.costCents / 100).toFixed(2)}  ${r.lastError ?? ""}`);
    rolls += r.attempts;
    cents += r.costCents;
    if (r.status === "GENERATED" || r.status === "APPROVED") done++;
    if (!rejectDir || !r.rejectedAssetIdsJson) continue;
    const ids = JSON.parse(r.rejectedAssetIdsJson) as string[];
    for (const [i, id] of ids.entries()) {
      const file = path.resolve(process.cwd(), rejectDir, `${name.replace(/\//g, "-")}.${i}.png`);
      writeFileSync(file, await readAssetBuffer(c, id));
      console.log(`  rejected render → ${path.relative(process.cwd(), file)}`);
    }
  }

  if (process.argv.includes("--scales")) await reportScales(c, gameId, rows);

  // The identity sheet is drawn once and every spot is painted from it.
  const sheetId = game.childProfile?.identityAssetId;
  const sheet = sheetId ? await c.db.asset.findUnique({ where: { id: sheetId }, select: { costCents: true } }) : null;
  const total = cents + (sheet?.costCents ?? 0);
  console.log("");
  console.log(`${done}/${rows.length} painted · ${rolls} rolls · ${(rolls / Math.max(1, done)).toFixed(1)} per finished spot`);
  console.log(`${(cents / 100).toFixed(2)} USD on hiding spots + ${((sheet?.costCents ?? 0) / 100).toFixed(2)} on the identity sheet = ${(total / 100).toFixed(2)} USD`);
}

/**
 * How big the model actually paints a child at each spot, against what we asked.
 *
 * Measured off renders already paid for, so it costs nothing. One render being
 * off is chance; a spot that is off the same way every time is a slot in the
 * wrong place — the model paints a person the size that spot really is, and no
 * number of retries will talk it out of the board's own perspective.
 */
async function reportScales(
  c: Awaited<ReturnType<typeof import("../src/services/container").getContainer>>,
  gameId: string,
  rows: Array<{ rejectedAssetIdsJson: string | null; variant: string; targetInstance: { targetId: string; gameScene: { sceneSlug: string } } }>,
) {
  const { readAssetBuffer } = await import("../src/services/asset.service");
  const { diffToPatch } = await import("../src/services/generation/patch");
  const { slotOf, cropOf } = await import("./slot-patch");
  console.log("");
  console.log("painted height ÷ asked height, from the renders that were thrown away:");
  for (const r of rows) {
    if (!r.rejectedAssetIdsJson) continue;
    const ids = JSON.parse(r.rejectedAssetIdsJson) as string[];
    if (ids.length === 0) continue;
    const name = `${r.targetInstance.gameScene.sceneSlug}/${r.targetInstance.targetId}`;
    let info;
    try {
      info = slotOf(r.targetInstance.gameScene.sceneSlug, r.targetInstance.targetId, r.variant);
    } catch {
      continue;
    }
    const original = await cropOf(info);
    const ratios: number[] = [];
    for (const id of ids) {
      const edited = await readAssetBuffer(c, id).catch(() => null);
      if (!edited) continue;
      const patch = await diffToPatch({ originalCrop: original, editedCrop: edited, ctx: info.ctx, art: info.art, slot: info.slot }).catch(() => null);
      if (patch && patch.largest > 0) ratios.push(patch.shape.height / patch.shape.childPx);
    }
    if (ratios.length === 0) continue;
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)]!;
    // One render being off is chance, and a suggestion drawn from it is worse
    // than none — it invites someone to edit a scene on a coin flip.
    const trusted = ratios.length >= 3 && (median < 0.6 || median > 1.7);
    console.log(
      `${name.padEnd(24)} ${median.toFixed(2)}x over ${String(ratios.length).padStart(2)} renders   slot scale ${info.slot.scale}` +
        (trusted
          ? `  → the board paints her ${(median > 1 ? median : 1 / median).toFixed(1)}x ${median > 1 ? "bigger" : "smaller"} than this slot asks; the scale does not match the perspective there`
          : ""),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
