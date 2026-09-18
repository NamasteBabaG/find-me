/** Bounded incident repair. Offline preparation/SQL only; never connects to a DB.
 * Publishes three immutable, previously rendered Bar pictures to one QA game.
 * Retains old assets and judge evidence. Does NOT invent an automated QA pass.
 * Deploy the media-only progress compatibility fix before executing publish-sql.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GameConfigSchema, type GameConfig } from "../src/domain/game/config";
import { validateReviewedChildGeometry, type ReviewedChildGeometry } from "./lib/adventure-three-config";
import { bindBookImage } from "../src/domain/adventure/image-binding";
import { readAdventureProgress, emptyAdventureProgress } from "../src/domain/adventure/progress";

const GAME = "game_hfivvgkg0qglz6ktonvv";
const DIR = path.resolve("storage/sydney-bug-20260918");
const manifestFile = path.join(DIR, "repair-manifest.json");
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
const replacements = [
  { board: "sydney", hide: 1, old: "ast_lp_a5c42fe26df398022d5bf43a", sha: "0ceff2afafae9eb2a873db6b422bf468542b6426c46fc9e8902460e15af643d4" },
  { board: "antarctica", hide: 1, old: "ast_lp_84e0b9a8cf50e80417970bdf", sha: "254a6ee90ac0baf3364139922904b4013d19dec0a9775518380f8e5c3582b7a5" },
  { board: "antarctica", hide: 2, old: "ast_lp_38792b24fb4700ce290336d6", sha: "d64f5a88a52e35e9d3f48ec2756894afb4eb209f9608dc6f19ffe7b9f77b4048" },
] as const;
type Entry = { hideId: string; source: string; sourceSha256: string; receipt: string; receiptSha256: string; inputs: string; inputsSha256: string; geometry: ReviewedChildGeometry; visualAccepted: boolean };
type RepairAsset = { id: string; key: string; file: string; sha256: string; bytes: number; board: string; targetId: string; old: string; variantId: string; targetInstanceId: string; rectJson: string; hitRectJson: string; headAnchorJson: string; review: Record<string, unknown> };
type Manifest = { gameId: string; ownerId: string; configJson: string; beforeHash: string; beforeBook: unknown; assets: RepairAsset[]; scenes: { id: string; beforeHash: string; configJson: string }[] };

async function main() {
  if (JSON.parse(readFileSync(".vercel/project.json", "utf8")).projectId !== "prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4") throw Error("QA project only");
  const [mode, arg, offsetArg] = process.argv.slice(2);
  if (mode === "prepare") {
    if (!arg) throw Error("prepare requires the historical source worktree");
    const root = path.resolve(arg), reviewFile = path.join(root, "storage/adventure-bar-density-20260914/final-review.json");
    const review = JSON.parse(readFileSync(reviewFile, "utf8"));
    const snapshot = JSON.parse(readFileSync(path.join(DIR, "snapshot-v2.json"), "utf8"));
    const config: GameConfig = JSON.parse(snapshot.game.configJson);
    GameConfigSchema.parse(config);
    if (snapshot.game.id !== GAME || config.gameId !== GAME || snapshot.game.status !== "DELIVERED" || !config.adventure || config.scenes.length !== 9) throw Error("Wrong game snapshot");
    const beforeBook = structuredClone(config.adventure), assets: RepairAsset[] = [];
    for (const item of replacements) {
      const hideId = `adventure-${item.board}-density-v3-${item.hide}`;
      const e: Entry = review.entries.find((entry: Entry) => entry.hideId === hideId);
      if (!review.accepted || !e?.visualAccepted || e.sourceSha256 !== item.sha) throw Error("Unreviewed replacement");
      for (const [file, expected] of [[e.source, e.sourceSha256], [e.receipt, e.receiptSha256], [e.inputs, e.inputsSha256]] as const) {
        const absolute = path.resolve(root, file);
        if (!absolute.startsWith(root + path.sep) || sha(readFileSync(absolute)) !== expected) throw Error("Source binding changed");
      }
      const inputs = JSON.parse(readFileSync(path.join(root, e.inputs), "utf8"));
      if (inputs.ageYears !== 5 || inputs.identitySha256 !== review.identitySha256) throw Error("Wrong identity input");
      const scene = config.scenes.find(s => s.slug === item.board)!, board = config.adventure.boards.find(b => b.boardSlug === item.board)!;
      if (scene.art.base !== inputs.plan.art.base || board.artSha256 !== inputs.plan.art.sha256 || sha(readFileSync(path.join("public", scene.art.base))) !== board.artSha256) throw Error("Art changed");
      const authored = inputs.board.hides.find((h: { id: string }) => h.id === hideId);
      const targetId = `hide-${item.hide}`, target = scene.targets.find(t => t.id === targetId)!;
      if (!authored || target.sprite.kind !== "image" || !target.sprite.url.startsWith(`/api/assets/${item.old}?`)) throw Error("Target changed");
      for (const sprite of Object.values(target.spriteByVariant ?? {})) if (sprite.kind !== "image" || !sprite.url.startsWith(`/api/assets/${item.old}?`)) throw Error("Variant changed");
      const row = snapshot.variants.find((v: { assetId: string }) => v.assetId === item.old);
      if (!row || row.status !== "GENERATED") throw Error("Variant receipt changed");
      const file = path.join(root, e.source), bytes = readFileSync(file), meta = await sharp(bytes).metadata();
      if (meta.width !== 512 || meta.height !== 768 || (meta.pages ?? 1) !== 1) throw Error("Unexpected image size");
      const g = validateReviewedChildGeometry(e.geometry), left = authored.left, top = authored.top;
      const id = `ast_repair_20260918_${item.board}_${item.hide}_${item.sha.slice(0, 12)}`;
      const rect = { x: left / 3840, y: top / 2160, w: 512 / 3840, h: 768 / 2160 };
      const hitRect = { x: (left + g.x) / 3840, y: (top + g.y) / 2160, w: g.w / 3840, h: g.h / 2160 };
      const anchor = { x: (left + g.headX) / 3840, y: (top + g.headY) / 2160 };
      const sprite = { ...target.sprite, url: `/api/assets/${id}`, rect, hitRect, anchor };
      target.sprite = sprite; target.spriteByVariant = { A: structuredClone(sprite), B: structuredClone(sprite) };
      for (const slot of target.slots) {
        slot.x = hitRect.x + hitRect.w / 2; slot.y = hitRect.y + hitRect.h / 2;
        slot.hintZone = { ...slot.hintZone, x: slot.x, y: slot.y };
      }
      const image = board.targetImages.find(t => t.targetId === targetId)!;
      const binding = bindBookImage(sprite);
      if (!binding) throw Error("Invalid repaired image binding");
      image.A = binding; image.B = structuredClone(binding);
      assets.push({ id, key: `game-repairs/${GAME}/${id}.png`, file, sha256: item.sha, bytes: bytes.length, board: item.board, targetId,
        old: item.old, variantId: row.id, targetInstanceId: row.targetInstanceId, rectJson: JSON.stringify(rect), hitRectJson: JSON.stringify(hitRect), headAnchorJson: JSON.stringify(anchor),
        review: { kind: "assistant-visual-repair/v1", sha256: item.sha, sourceReceiptSha256: e.receiptSha256, sourceInputsSha256: e.inputsSha256,
          reviewSha256: sha(readFileSync(reviewFile)), geometry: g, parentLikenessConfirmation: "pending", automatedPublicationPass: false,
          note: "Reviewed against original Bar photo and native scene. Reused prior render; zero new provider calls. Original failed visual verdict retained below. Automatic recomposition requires a new source-bound review." } });
    }
    GameConfigSchema.parse(config);
    readAdventureProgress(emptyAdventureProgress(GAME, beforeBook), GAME, config.adventure);
    const scenes = snapshot.scenes.map((s: { id: string; sceneSlug: string; configJson: string }) => ({ id: s.id, beforeHash: sha(s.configJson), configJson: JSON.stringify(config.scenes.find(scene => scene.slug === s.sceneSlug)) }));
    const manifest: Manifest = { gameId: GAME, ownerId: snapshot.game.ownerId, beforeHash: sha(snapshot.game.configJson), beforeBook, configJson: JSON.stringify(config), assets, scenes };
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ gameId: GAME, pictures: assets.map(a => ({ id: a.id, sha256: a.sha256, bytes: a.bytes })), configSha256: sha(manifest.configJson) })); return;
  }
  const m: Manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (m.gameId !== GAME || m.assets.length !== 3 || m.assets.some((a, i) => a.old !== replacements[i]!.old || a.sha256 !== replacements[i]!.sha || sha(readFileSync(a.file)) !== a.sha256)) throw Error("Manifest/source mismatch");
  GameConfigSchema.parse(JSON.parse(m.configJson));
  if (mode === "chunk") {
    const a = m.assets[Number(arg)], offset = Number(offsetArg), size = 262144;
    if (!a || !Number.isSafeInteger(offset) || offset < 0 || offset >= a.bytes || offset % size) throw Error("Invalid chunk");
    const part = readFileSync(a.file).subarray(offset, offset + size);
    const query = `DO $repair$ DECLARE part bytea := decode(${q(part.toString("base64"))},'base64'); old_data bytea; BEGIN
      IF ${offset}=0 THEN INSERT INTO qa."FileBlob" (key,data,"contentType") VALUES (${q(a.key)},decode('','hex'),'image/png') ON CONFLICT(key) DO NOTHING; END IF;
      SELECT data INTO old_data FROM qa."FileBlob" WHERE key=${q(a.key)} FOR UPDATE;
      IF old_data IS NULL THEN RAISE EXCEPTION 'Missing prefix'; END IF;
      IF octet_length(old_data)=${offset} THEN UPDATE qa."FileBlob" SET data=data||part WHERE key=${q(a.key)};
      ELSIF octet_length(old_data)>=${offset + part.length} AND substring(old_data FROM ${offset + 1} FOR ${part.length})=part THEN NULL;
      ELSE RAISE EXCEPTION 'Conflicting immutable bytes'; END IF; END $repair$; SELECT octet_length(data) AS bytes FROM qa."FileBlob" WHERE key=${q(a.key)};`;
    console.log(JSON.stringify({ query })); return;
  }
  if (mode !== "publish-sql") throw Error("Use prepare SOURCE_ROOT, chunk INDEX OFFSET or publish-sql");
  const config = JSON.parse(m.configJson), auditId = `aud_picture_repair_${GAME}_20260918`;
  const checks = m.assets.map(a => `IF NOT EXISTS(SELECT 1 FROM qa."FileBlob" WHERE key=${q(a.key)} AND octet_length(data)=${a.bytes} AND encode(sha256(data),'hex')=${q(a.sha256)}) THEN RAISE EXCEPTION 'Unverified blob'; END IF;
    PERFORM 1 FROM qa."TargetVariantAsset" WHERE id=${q(a.variantId)} AND "assetId"=${q(a.old)} AND status='GENERATED' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant changed'; END IF;`).join("\n");
  const writes = m.assets.map(a => `INSERT INTO qa."Asset" (id,"ownerId",type,visibility,"storagePath","mimeType",width,height,bytes,provider,"costCents",status) VALUES
    (${q(a.id)},${q(m.ownerId)},'TARGET_SPRITE','GAME',${q(a.key)},'image/png',512,768,${a.bytes},'reviewed-prior-render-reuse',0,'READY');
    UPDATE qa."TargetVariantAsset" SET "assetId"=${q(a.id)}, "rectJson"=${q(a.rectJson)}, "hitRectJson"=${q(a.hitRectJson)}, "headAnchorJson"=${q(a.headAnchorJson)}, status='APPROVED',
      "judgeJson"=jsonb_build_object('manualRepair',${q(JSON.stringify(a.review))}::jsonb,'replacedAssetId',"assetId",'previousJudge',"judgeJson"::jsonb)::text,"updatedAt"=now()
      WHERE id=${q(a.variantId)};
    UPDATE qa."TargetInstance" SET "spriteAssetId"=${q(a.id)} WHERE id=${q(a.targetInstanceId)} AND "spriteAssetId"=${q(a.old)};`).join("\n");
  const sceneWrites = m.scenes.map(s => `UPDATE qa."GameScene" SET "configJson"=${q(s.configJson)} WHERE id=${q(s.id)} AND "gameId"=${q(GAME)} AND encode(sha256(convert_to("configJson",'UTF8')),'hex')=${q(s.beforeHash)};
    IF NOT FOUND THEN RAISE EXCEPTION 'Scene changed'; END IF;`).join("\n");
  const query = `DO $repair$ DECLARE before_progress jsonb; before_revision integer; BEGIN
    PERFORM 1 FROM qa."Game" WHERE id=${q(GAME)} AND "ownerId"=${q(m.ownerId)} AND status='DELIVERED' AND "deletedAt" IS NULL
      AND encode(sha256(convert_to("configJson",'UTF8')),'hex')=${q(m.beforeHash)} FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Game changed or already repaired'; END IF;
    IF EXISTS(SELECT 1 FROM qa."GenerationJob" WHERE "gameId"=${q(GAME)} AND status IN ('RUNNING','QUEUED')) THEN RAISE EXCEPTION 'Game generation still active'; END IF;
    ${checks}
    SELECT "snapshotJson"::jsonb,revision INTO before_progress,before_revision FROM qa."AdventureAlbumProgress" WHERE "gameId"=${q(GAME)} FOR UPDATE;
    IF before_progress IS NOT NULL AND before_progress->'book' <> ${q(JSON.stringify(m.beforeBook))}::jsonb THEN RAISE EXCEPTION 'Progress book changed'; END IF;
    INSERT INTO qa."AuditLog" (id,"actorType",action,"entityType","entityId","metaJson") VALUES
      (${q(auditId)},'ADMIN','game:qa-reviewed-picture-repair','Game',${q(GAME)},jsonb_build_object('priorConfig',(SELECT "configJson"::jsonb FROM qa."Game" WHERE id=${q(GAME)}),'priorProgress',before_progress,'priorRevision',before_revision,'repairs',${q(JSON.stringify(m.assets.map(({ file: _file, ...a }) => a)))}::jsonb)::text);
    ${writes}
    ${sceneWrites}
    UPDATE qa."Game" SET "configJson"=${q(m.configJson)},"updatedAt"=now() WHERE id=${q(GAME)};
    IF before_progress IS NOT NULL THEN UPDATE qa."AdventureAlbumProgress" SET "snapshotJson"=jsonb_set(before_progress,'{book}',${q(JSON.stringify(config.adventure))}::jsonb)::text,revision=revision+1 WHERE "gameId"=${q(GAME)} AND revision=before_revision;
      IF NOT FOUND THEN RAISE EXCEPTION 'Progress changed'; END IF; END IF;
    END $repair$;
    SELECT revision,jsonb_array_length("snapshotJson"::jsonb->'finds') AS finds,jsonb_array_length("snapshotJson"::jsonb->'discoveries') AS discoveries FROM qa."AdventureAlbumProgress" WHERE "gameId"=${q(GAME)};`;
  console.log(JSON.stringify({ query }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Repair failed"); process.exitCode = 1; });
