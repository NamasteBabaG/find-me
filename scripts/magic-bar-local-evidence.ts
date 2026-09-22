/** Read-only, isolated pilot persistence evidence. Never accepts a DB URL. */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adventureAlbum, AdventureProgressSchema } from "../src/domain/adventure/progress";
const args = process.argv.slice(2);
if (args.length > 1 || args.length === 1 && !["--journey-refresh","--two-worlds"].includes(args[0]!)) throw Error("Optional --journey-refresh or --two-worlds only");
const dir = path.resolve(args[0] === "--two-worlds" ? "storage/two-worlds-bar-20260919" : args[0] === "--journey-refresh" ? "storage/journey-refresh-bar-20260919" : "storage/magic-bar-20260918");
const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "game.sqlite").replaceAll("\\", "/")}` } } });
async function main() {
  const saved = JSON.parse(readFileSync(path.join(dir, "local-game.json"), "utf8"));
  const row = await db.adventureAlbumProgress.findUniqueOrThrow({ where: { gameId: saved.gameId } });
  const progress = AdventureProgressSchema.parse(JSON.parse(row.snapshotJson)), album = adventureAlbum(progress);
  const preferences = await db.passportPagePreference.findMany({ where: { gameId: saved.gameId }, select: { boardSlug: true, photoTargetId: true } });
  const report = { gameId: saved.gameId, revision: row.revision, stars: album.stars, discoveries: album.discoveries, postcards: album.postcards, preferences };
  writeFileSync(path.join(dir, "persistence-evidence.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (album.stars.found !== saved.hides || album.discoveries.collected !== saved.discoveries || album.postcards.collected !== saved.boards) throw Error("Incomplete or inflated pilot progress");
}
main().finally(() => db.$disconnect());
