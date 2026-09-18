/** Offline, source-bound transfer for the authenticated QA database connector.
 * Prints SQL, never executes it. Uses only schema qa, an isolated mock owner,
 * exact reviewed PNG bytes, and an atomic final publication. No production
 * connection, catalog changes, existing-game edits or QA-gate bypass.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS } from "../content/adventures/magic-pilot";
import { prepareAdventureConfig } from "../src/services/adventure-content.service";
import { threeBoardConfig, validateReviewedChildGeometry } from "./lib/adventure-three-config";

const directory = path.resolve("storage/magic-bar-20260918");
const manifestPath = path.join(directory, "qa-transfer.json");
const hash = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const GAME = "game_magic_bar_qa_20260918_v1", OWNER = "usr_magic_bar_qa_20260918", CHILD = "fam_magic_bar_qa_20260918";
type Asset = { id: string; key: string; file: string; sha256: string; bytes: number; width: number; height: number; type: "AVATAR" | "TARGET_SPRITE" };
type Manifest = { gameId: string; ownerId: string; childId: string; reviewSha256: string; configJson: string; assets: Asset[] };

async function main() {
  const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  if (project.projectId !== "prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4") throw Error("Dedicated QA project only");
  const [mode, indexRaw, offsetRaw] = process.argv.slice(2);
  if (mode === "prepare") {
    const inputsBytes = readFileSync(path.join(directory, "inputs.json")), inputs = JSON.parse(inputsBytes.toString());
    const reviewBytes = readFileSync(path.join(directory, "final-review.json")), review = JSON.parse(reviewBytes.toString());
    if (!review.accepted || review.inputsSha256 !== hash(inputsBytes)) throw Error("Approval binding failed");
    const assets: Asset[] = [], patchUrls: Record<string, string> = {}, geometry: Parameters<typeof threeBoardConfig>[0]["geometry"] = {};
    async function asset(name: string, file: string, expected: string, type: Asset["type"]) {
      const bytes = readFileSync(file), meta = await sharp(bytes).metadata();
      if (hash(bytes) !== expected || !meta.width || !meta.height || (meta.pages ?? 1) !== 1) throw Error("Asset changed");
      const id = `ast_magic_bar_qa_20260918_${name}`;
      assets.push({ id, key: `private-pilots/${GAME}/${name}.png`, file, sha256: expected, bytes: bytes.length, width: meta.width, height: meta.height, type });
      return `/api/assets/${id}`;
    }
    const avatarUrl = await asset("avatar", path.join(directory, "avatar.png"), review.avatarSha256, "AVATAR");
    for (const board of MAGIC_PILOT_PATCH_BOARDS) {
      const pinned = inputs.boards.find((b: { board: { board: string } }) => b.board.board === board.board);
      if (!pinned || JSON.stringify(pinned.board) !== JSON.stringify(board) || hash(readFileSync(board.art)) !== pinned.sourceSha256) throw Error("Board changed");
      const groupFile = review.groupReviews[board.board];
      if (typeof groupFile !== "string" || !new RegExp(`^${board.board}-review-[123]-[123]-[123]\\.json$`).test(groupFile)) throw Error("Invalid review source");
      const groupBytes = readFileSync(path.join(directory, groupFile)), group = JSON.parse(groupBytes.toString());
      if (hash(groupBytes) !== review.groupHashes[board.board] || group.inputsSha256 !== hash(inputsBytes)) throw Error("Grouped review changed");
      for (const [i, hide] of board.hides.entries()) {
        const selected = review.hides[hide.id];
        if (![1, 2, 3].includes(selected?.attempt) || group.attempts[i] !== selected.attempt || group.dispositions[hide.id]?.state !== "acceptable") throw Error("Hide not approved");
        const file = path.join(directory, `${hide.id}-attempt-${selected.attempt}.png`);
        const technical = JSON.parse(readFileSync(file.replace(/\.png$/, ".json"), "utf8"));
        if (!technical.accepted || technical.costUnknown || technical.inputsSha256 !== hash(inputsBytes) || technical.sha256 !== selected.sha256 || group.patches[hide.id] !== selected.sha256) throw Error("Technical approval changed");
        geometry[hide.id] = validateReviewedChildGeometry(selected.geometry);
        patchUrls[hide.id] = await asset(hide.id, file, selected.sha256, "TARGET_SPRITE");
      }
    }
    const config = await prepareAdventureConfig(threeBoardConfig({ gameId: GAME, childName: "בר", avatarUrl, patchUrls, geometry,
      composedAt: "2026-09-18T12:00:00.000Z", boards: MAGIC_PILOT_PATCH_BOARDS, catalog: MAGIC_PILOT_CATALOG,
      world: { slug: "magic-pilot", name: "בר בעולם הקסם — פיילוט", mapArt: "/worlds/kingdom/map.webp" },
    }), MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS.map(b => b.board), path.resolve("public"));
    const manifest: Manifest = { gameId: GAME, ownerId: OWNER, childId: CHILD, reviewSha256: hash(reviewBytes), assets, configJson: JSON.stringify(config) };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ assets: assets.map(({ file: _file, ...a }) => a), gameId: GAME, configSha256: hash(manifest.configJson) }));
    return;
  }
  const m: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (m.gameId !== GAME || m.ownerId !== OWNER || m.childId !== CHILD || m.assets.length !== 10
    || m.reviewSha256 !== hash(readFileSync(path.join(directory, "final-review.json")))) throw Error("Transfer manifest mismatch");
  if (mode === "signin-sql") {
    // Ordinary one-use owner login for ONLY the isolated test owner. This does
    // not grant QA access: the tester must pass the normal QA gate separately.
    const token = randomBytes(32).toString("base64url"), id = `mlt_${randomBytes(16).toString("hex")}`;
    const ownerSignIn = new URL("/auth/magic-link", "https://qa.findmeworlds.com");
    ownerSignIn.searchParams.set("token", token); ownerSignIn.searchParams.set("next", `/library/${GAME}`);
    writeFileSync(path.join(directory, "qa-game.json"), JSON.stringify({ gameId: GAME, childId: CHILD, ownerSignIn: ownerSignIn.toString() }, null, 2));
    console.log(JSON.stringify({ query: `INSERT INTO qa."MagicLinkToken" (id,"userId","tokenHash","expiresAt") SELECT ${quote(id)},id,${quote(hash(token))},now()+interval '15 minutes' FROM qa."User" WHERE id=${quote(OWNER)} AND email='magic-bar-pilot@findme.local' RETURNING id;` })); return;
  }
  if (mode === "chunk") {
    const index = Number(indexRaw), offset = Number(offsetRaw), a = m.assets[index];
    if (!a || !Number.isSafeInteger(offset) || offset < 0 || offset >= a.bytes || offset % 65536 !== 0) throw Error("Invalid chunk");
    const bytes = readFileSync(a.file);
    if (bytes.length !== a.bytes || hash(bytes) !== a.sha256) throw Error("Source bytes changed");
    const part = bytes.subarray(offset, offset + 65536);
    const sql = `DO $pilot$ DECLARE part bytea := decode(${quote(part.toString("base64"))},'base64'); current_data bytea; BEGIN
      IF ${offset}=0 THEN INSERT INTO qa."FileBlob" (key,data,"contentType") VALUES (${quote(a.key)},decode('','hex'),'image/png') ON CONFLICT (key) DO NOTHING; END IF;
      SELECT data INTO current_data FROM qa."FileBlob" WHERE key=${quote(a.key)} FOR UPDATE;
      IF current_data IS NULL THEN RAISE EXCEPTION 'missing chunk prefix'; END IF;
      IF octet_length(current_data)=${offset} THEN UPDATE qa."FileBlob" SET data=data||part WHERE key=${quote(a.key)};
      ELSIF octet_length(current_data)>=${offset + part.length} AND substring(current_data FROM ${offset + 1} FOR ${part.length})=part THEN NULL;
      ELSE RAISE EXCEPTION 'conflicting chunk, refusing overwrite'; END IF;
      END $pilot$; SELECT octet_length(data) AS bytes FROM qa."FileBlob" WHERE key=${quote(a.key)};`;
    console.log(JSON.stringify({ query: sql, index, offset, length: part.length })); return;
  }
  if (mode !== "publish-sql") throw Error("Use prepare, chunk INDEX OFFSET, or publish-sql");
  for (const a of m.assets) if (hash(readFileSync(a.file)) !== a.sha256) throw Error("Source changed before publication");
  const checks = m.assets.map(a => `IF NOT EXISTS(SELECT 1 FROM qa."FileBlob" WHERE key=${quote(a.key)} AND octet_length(data)=${a.bytes} AND encode(sha256(data),'hex')=${quote(a.sha256)} AND "contentType"='image/png') THEN RAISE EXCEPTION 'unverified blob: ${a.id}'; END IF;`).join("\n");
  const assetRows = m.assets.map(a => `(${quote(a.id)},${quote(OWNER)},${quote(a.type)},'GAME',${quote(a.key)},'image/png',${a.width},${a.height},${a.bytes},'reviewed-magic-pilot-v1',${quote(`${GAME}:${a.sha256}`)},0,'READY')`).join(",\n");
  const scenes = JSON.parse(m.configJson).scenes as Array<{ slug: string; version: number }>;
  const sceneRows = scenes.map((s, i) => `(${quote(`gsc_${GAME}_${i}`)},${quote(GAME)},${quote(s.slug)},${s.version},${i},'QA_OK',${quote(JSON.stringify(s))})`).join(",\n");
  const sql = `DO $pilot$ BEGIN
    ${checks}
    IF EXISTS(SELECT 1 FROM qa."Game" WHERE id=${quote(GAME)}) THEN
      IF NOT EXISTS(SELECT 1 FROM qa."Game" WHERE id=${quote(GAME)} AND "ownerId"=${quote(OWNER)} AND "familyChildId"=${quote(CHILD)} AND "configJson"=${quote(m.configJson)}) THEN RAISE EXCEPTION 'unrelated existing game'; END IF;
    ELSE
    INSERT INTO qa."User" (id,email,locale) VALUES (${quote(OWNER)},'magic-bar-pilot@findme.local','he');
    INSERT INTO qa."FamilyChild" (id,"ownerId","displayName") VALUES (${quote(CHILD)},${quote(OWNER)},'בר');
    INSERT INTO qa."Asset" (id,"ownerId",type,visibility,"storagePath","mimeType",width,height,bytes,provider,"providerRequestId","costCents",status) VALUES ${assetRows};
    INSERT INTO qa."Game" (id,"ownerId","familyChildId","packageTier",title,status,"sceneCount","styleVersion",locale,"draftToken","configJson","updatedAt","paidAt","readyAt","deliveredAt") VALUES
      (${quote(GAME)},${quote(OWNER)},${quote(CHILD)},'ONE_WORLD','בר בעולם הקסם — בדיקת שלושה בורדים','DELIVERED',3,'adventure-three-v1','he',${quote(`draft_${GAME}`)},${quote(m.configJson)},now(),now(),now(),now());
    INSERT INTO qa."Order" (id,"userId","gameId","amountAgorot","packageTier","paymentStatus",provider,"paidAt") VALUES
      (${quote(`ord_${GAME}`)},${quote(OWNER)},${quote(GAME)},0,'ONE_WORLD','PAID','mock',now());
    END IF;
    INSERT INTO qa."GameScene" (id,"gameId","sceneSlug","sceneVersion","orderIndex","generationStatus","configJson") VALUES ${sceneRows} ON CONFLICT ("gameId","sceneSlug") DO NOTHING;
    END $pilot$;
    SELECT id,status,"sceneCount",json_array_length(("configJson"::json)->'scenes') AS boards FROM qa."Game" WHERE id=${quote(GAME)};`;
  console.log(JSON.stringify({ query: sql }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Transfer preparation failed"); process.exitCode = 1; });
