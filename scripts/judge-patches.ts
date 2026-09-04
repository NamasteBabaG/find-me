/**
 * Ask the patch judge about every hiding spot a game already has.
 *
 *   npx tsx scripts/judge-patches.ts <gameId> [--model=gpt-4o-mini] [--out=work/judged]
 *
 * Reads finished patches out of the database and prints a verdict for each, with
 * what the whole pass cost. Nothing is written back — this is how the judge is
 * measured against patches whose answers are already known before it is allowed
 * to reject anything a customer paid for.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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
  if (!gameId) throw new Error("usage: npx tsx scripts/judge-patches.ts <gameId>");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  const { getContainer } = await import("../src/services/container");
  const { readAssetBuffer } = await import("../src/services/asset.service");
  const { OpenAiPatchJudge } = await import("../src/infra/generation/judge");
  const c = getContainer();

  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
  const sheetId = game.childProfile?.identityAssetId;
  if (!sheetId) throw new Error("this game has no identity sheet to compare against");
  const reference = await readAssetBuffer(c, sheetId);
  const childName = game.childProfile?.displayName ?? "the child";

  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { in: ["GENERATED", "APPROVED"] }, assetId: { not: null } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true, orderIndex: true } } } } },
    orderBy: [{ targetInstance: { gameScene: { orderIndex: "asc" } } }, { createdAt: "asc" }],
  });

  const outDir = flag("out");
  if (outDir) mkdirSync(path.resolve(process.cwd(), outDir), { recursive: true });
  const judge = new OpenAiPatchJudge(key, { model: flag("model", "gpt-4o-mini") });

  let cents = 0;
  const counts = { ok: 0, bad: 0, unknown: 0 };
  for (const r of rows) {
    const label = `${r.targetInstance.gameScene.sceneSlug}/${r.targetInstance.targetId}`;
    const patchPng = await readAssetBuffer(c, r.assetId as string);
    const v = await judge.judge({ patchPng, reference, childName, label });
    cents += v.costCents;
    counts[v.verdict]++;
    console.log(`${v.verdict === "ok" ? " ok " : v.verdict === "bad" ? "BAD " : " ?  "} ${label.padEnd(24)} ${v.reason}`);
    if (outDir && v.verdict !== "ok") {
      writeFileSync(path.resolve(process.cwd(), outDir, `${label.replace(/\//g, "-")}.png`), patchPng);
    }
  }
  console.log("");
  console.log(`${counts.ok} ok · ${counts.bad} rejected · ${counts.unknown} unknown · ${(cents / 100).toFixed(3)} USD for ${rows.length} judgements`);
  console.log(`that is ${(cents / Math.max(1, rows.length) / 100).toFixed(4)} USD each, against about 0.07 for one roll`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
