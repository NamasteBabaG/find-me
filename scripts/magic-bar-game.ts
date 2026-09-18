/** Assemble ONLY the reviewed private pilot. Local by default; explicit QA mode
 * requires the dedicated QA project, schema, mock payments and DB asset store.
 * Never overwrites an existing game or publishes the incomplete magic world.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "../src/lib/env";
import { getContainer } from "../src/services/container";
import { applyTestSchema } from "../src/lib/test-schema";
import { ensureUser, createMagicLink } from "../src/services/auth.service";
import { signedAssetUrl, storeAsset } from "../src/services/asset.service";
import { ensurePlayerLink } from "../src/services/share-link.service";
import { prepareAdventureConfig } from "../src/services/adventure-content.service";
import { MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS } from "../content/adventures/magic-pilot";
import { threeBoardConfig, validateReviewedChildGeometry, type ReviewedChildGeometry } from "./lib/adventure-three-config";

const hash = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
async function main() {
  const args = process.argv.slice(2), qa = args[0] === "--qa-reviewed";
  if (args.length !== 1 || !["--local-reviewed", "--qa-reviewed"].includes(args[0]!)) throw Error("Choose --local-reviewed or --qa-reviewed");
  const e = env(), directory = path.resolve("storage/magic-bar-20260918"), expectedDb = path.join(directory, "game.sqlite");
  if (qa) {
    const project = JSON.parse(readFileSync(".vercel/project.json", "utf8")), dbUrl = new URL(e.DATABASE_URL);
    if (project.projectId !== "prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4" || e.APP_ENV !== "qa" || e.APP_URL !== "https://qa.findmeworlds.com"
      || dbUrl.searchParams.get("schema") !== "qa" || !["postgres:", "postgresql:"].includes(dbUrl.protocol)
      || e.PAYMENT_PROVIDER !== "mock" || e.STORAGE_PROVIDER !== "db") throw Error("Dedicated QA only, never production");
  } else if (e.NODE_ENV === "production" || e.APP_ENV !== "development" || e.DATABASE_URL !== `file:${expectedDb.replaceAll("\\", "/")}`
    || e.STORAGE_PROVIDER !== "local" || e.GENERATION_PROVIDER !== "mock" || e.PAYMENT_PROVIDER !== "mock" || e.GENERATION_ENABLED !== "off") throw Error("Use isolated local pilot DB/storage, disabled mock generation/payments");
  const inputsBytes = readFileSync(path.join(directory, "inputs.json")), inputs = JSON.parse(inputsBytes.toString());
  const review = JSON.parse(readFileSync(path.join(directory, "final-review.json"), "utf8"));
  if (review.accepted !== true || review.inputsSha256 !== hash(inputsBytes) || inputs.version !== "magic-bar-three-20260918-v1") throw Error("Pilot needs exact source-bound approval");
  const avatar = readFileSync(path.join(directory, "avatar.png"));
  if (review.avatarSha256 !== hash(avatar) || inputs.avatarSha256 !== hash(avatar)) throw Error("Avatar changed");
  const geometry: Record<string, ReviewedChildGeometry> = {}, patches: { id: string; bytes: Buffer }[] = [];
  for (const board of MAGIC_PILOT_PATCH_BOARDS) {
    const pinned = inputs.boards.find((b: { board: { board: string } }) => b.board.board === board.board);
    if (!pinned || JSON.stringify(pinned.board) !== JSON.stringify(board) || hash(readFileSync(board.art)) !== pinned.sourceSha256) throw Error("Reviewed board changed");
    const groupSource = review.groupReviews[board.board];
    if (typeof groupSource !== "string" || !new RegExp(`^${board.board}-review-[123]-[123]-[123]\\.json$`).test(groupSource)) throw Error("Invalid grouped review path");
    const groupBytes = readFileSync(path.join(directory, groupSource)), group = JSON.parse(groupBytes.toString());
    if (review.groupHashes[board.board] !== hash(groupBytes) || group.inputsSha256 !== review.inputsSha256) throw Error("Grouped review changed");
    for (const [i, hide] of board.hides.entries()) {
      const selected = review.hides[hide.id], attempt = selected?.attempt;
      if (![1, 2, 3].includes(attempt) || group.attempts[i] !== attempt || group.dispositions[hide.id]?.state !== "acceptable") throw Error(`Not approved: ${hide.id}`);
      const prefix = path.join(directory, `${hide.id}-attempt-${attempt}`), bytes = readFileSync(`${prefix}.png`);
      const technical = JSON.parse(readFileSync(`${prefix}.json`, "utf8"));
      if (!technical.accepted || technical.costUnknown || technical.inputsSha256 !== review.inputsSha256 || technical.sha256 !== hash(bytes)
        || selected.sha256 !== hash(bytes) || group.patches[hide.id] !== hash(bytes)) throw Error(`Candidate binding failed: ${hide.id}`);
      const meta = await sharp(bytes).metadata();
      if (meta.width !== 512 || meta.height !== 768 || (meta.pages ?? 1) !== 1) throw Error("Unexpected patch raster");
      geometry[hide.id] = validateReviewedChildGeometry(selected.geometry); patches.push({ id: hide.id, bytes });
    }
  }
  const c = getContainer();
  try {
    if (!qa && !existsSync(expectedDb)) await applyTestSchema(c.db);
    if (qa) {
      const schemas = await c.db.$queryRawUnsafe<Array<{ schema_name: string }>>("select current_schema() as schema_name");
      if (schemas[0]?.schema_name !== "qa") throw Error("Refusing any other DB schema");
    }
    const gameId = qa ? "game_magic_bar_qa_20260918_v1" : "game_magic_bar_local_20260918_v1";
    const existing = await c.db.game.findUnique({ where: { id: gameId } });
    if (existing) {
      if (!existing.ownerId || !existing.familyChildId) throw Error("Existing game is unrelated");
      const previous = JSON.parse(existing.configJson ?? "null");
      if (previous?.child?.name !== "בר" || previous?.scenes?.map((s: { slug: string }) => s.slug).join() !== MAGIC_PILOT_PATCH_BOARDS.map(b => b.board).join()) throw Error("Refuse unrelated immutable game");
      console.log(JSON.stringify({ gameId, unchanged: true, player: (await ensurePlayerLink(c, gameId)).url })); return;
    }
    const owner = await ensureUser(c, "magic-bar-pilot@findme.local");
    const childId = qa ? "fam_magic_bar_qa_20260918" : "fam_magic_bar_local_20260918";
    const child = await c.db.familyChild.findUnique({ where: { id: childId } });
    if (child && (child.ownerId !== owner.id || child.deletedAt)) throw Error("Child is unrelated");
    if (!child) await c.db.familyChild.create({ data: { id: childId, ownerId: owner.id, displayName: "בר" } });
    async function save(id: string, type: "AVATAR" | "TARGET_SPRITE", bytes: Buffer) {
      const meta = await sharp(bytes).metadata();
      const asset = await storeAsset(c, { ownerId: owner.id, type, visibility: "GAME", buffer: bytes, mimeType: "image/png", width: meta.width, height: meta.height,
        provider: "reviewed-magic-pilot-v1", providerRequestId: `${gameId}:${id}:${hash(bytes)}` });
      return signedAssetUrl(c, asset.id);
    }
    const avatarUrl = await save("avatar", "AVATAR", avatar), patchUrls: Record<string, string> = {};
    for (const patch of patches) patchUrls[patch.id] = await save(patch.id, "TARGET_SPRITE", patch.bytes);
    const config = await prepareAdventureConfig(threeBoardConfig({ gameId, childName: "בר", avatarUrl, patchUrls, geometry,
      composedAt: new Date().toISOString(), boards: MAGIC_PILOT_PATCH_BOARDS, catalog: MAGIC_PILOT_CATALOG,
      world: { slug: "magic-pilot", name: "בר בעולם הקסם — פיילוט", mapArt: "/worlds/kingdom/map.webp" },
    }), MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS.map(b => b.board), path.resolve("public"));
    const now = new Date();
    await c.db.$transaction(async tx => {
      await tx.game.create({ data: { id: gameId, ownerId: owner.id, familyChildId: childId, packageTier: "ONE_WORLD", title: "בר בעולם הקסם — בדיקת שלושה בורדים",
        status: "DELIVERED", sceneCount: 3, styleVersion: config.styleVersion, locale: "he", draftToken: `draft_${gameId}`,
        configJson: JSON.stringify(config), paidAt: now, readyAt: now, deliveredAt: now,
        scenes: { create: config.scenes.map((scene, orderIndex) => ({ id: `gsc_${gameId}_${orderIndex}`, sceneSlug: scene.slug,
          sceneVersion: scene.version, orderIndex, generationStatus: "QA_OK", configJson: JSON.stringify(scene) })) } } });
      await tx.order.create({ data: { id: `ord_${gameId}`, gameId, userId: owner.id, packageTier: "ONE_WORLD", paymentStatus: "PAID", amountAgorot: 0, provider: "mock" } });
    });
    const result = { gameId, childId, environment: qa ? "qa" : "local", player: (await ensurePlayerLink(c, gameId)).url,
      ownerSignIn: await createMagicLink(c, owner.id, `/family/${childId}/play/${gameId}`), boards: 3, hides: 9, discoveries: 18, reviewSha256: hash(JSON.stringify(review)) };
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, qa ? "qa-game.json" : "local-game.json"), JSON.stringify(result, null, 2));
    // The private file retains the sign-in bearer; no owner credential in logs.
    console.log(JSON.stringify({ gameId, environment: result.environment, boards: 3, hides: 9, discoveries: 18, linkFile: qa ? "qa-game.json" : "local-game.json" }));
  } finally { await c.db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Pilot assembly failed"); process.exitCode = 1; });
