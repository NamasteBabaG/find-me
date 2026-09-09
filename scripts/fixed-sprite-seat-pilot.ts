/** Free, deterministic seat pilot. Never calls an API or mutates scene/game data. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { extractSpriteCell, computeFixedPlacement, evaluateFixedPlacement, fixedPlacementManifest, sha256Bytes, sha256Rgba, type SpriteSource, type FixedSlotContract, type FixedPlacement } from "../src/services/generation/fixed-sprite";

const ROOT = path.resolve("work/fixed-sprite-pilot-20260908/seat-v1");
const BOARD = "public/scenes/antarctica/refresh-20260907/base.webp";
const SPRITE = "work/fixed-sprite-pilot-20260908/stages/style-seated-v1/sheet.png";
const WINDOW = { left: 1500, top: 1360, width: 920, height: 688 };
const json = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2), { flag: "wx" });
const arg = (name: string, fallback = "") => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

async function prepare() {
  const dir = path.join(ROOT, "reference");
  if (existsSync(dir)) throw new Error("Reference stage already exists");
  mkdirSync(dir, { recursive: true });
  const board = await sharp(BOARD).extract(WINDOW).png().toBuffer();
  writeFileSync(path.join(dir, "board.png"), board, { flag: "wx" });
  const ticks: string[] = [];
  for (let x = 1500; x <= 2420; x += 50) ticks.push(`<path d="M${x - WINDOW.left} 0V${WINDOW.height}" stroke="#ef476f" opacity=".5"/><text x="${x - WINDOW.left + 2}" y="18" fill="#111" stroke="white" stroke-width="2" paint-order="stroke" font-size="13">${x}</text>`);
  for (let y = 1400; y <= 2000; y += 50) ticks.push(`<path d="M0 ${y - WINDOW.top}H${WINDOW.width}" stroke="#ef476f" opacity=".5"/><text x="2" y="${y - WINDOW.top - 3}" fill="#111" stroke="white" stroke-width="2" paint-order="stroke" font-size="13">${y}</text>`);
  const grid = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WINDOW.width}" height="${WINDOW.height}">${ticks.join("")}</svg>`);
  await sharp(board).composite([{ input: grid }]).png().toFile(path.join(dir, "board-grid.png"));
  json(path.join(dir, "coordinates.json"), { board: BOARD, sprite: SPRITE, window: WINDOW, purpose: "One-time board annotation; no child generated and no placement yet" });
  console.log(dir);
}

async function detail() {
  const dir = path.join(ROOT, "detail");
  if (existsSync(dir)) throw new Error("Detail stage already exists");
  mkdirSync(dir, { recursive: true });
  const rect = { left: 1800, top: 1700, width: 320, height: 280 };
  const crop = await sharp(BOARD).extract(rect).resize(960, 840, { kernel: "nearest" }).png().toBuffer();
  const lines: string[] = [];
  for (let x = 1800; x <= 2100; x += 25) lines.push(`<path d="M${(x - rect.left) * 3} 0V840" stroke="#00e5ff" opacity=".4"/><text x="${(x - rect.left) * 3 + 3}" y="24" font-size="17" fill="white" stroke="#111" stroke-width="3" paint-order="stroke">${x}</text>`);
  for (let y = 1700; y <= 1950; y += 25) lines.push(`<path d="M0 ${(y - rect.top) * 3}H960" stroke="#00e5ff" opacity=".4"/><text x="3" y="${(y - rect.top) * 3 + 20}" font-size="17" fill="white" stroke="#111" stroke-width="3" paint-order="stroke">${y}</text>`);
  await sharp(crop).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="840">${lines.join("")}</svg>`) }]).png().toFile(path.join(dir, "seat-grid.png"));
  const source = await sharp(SPRITE).flatten({ background: "#ddd" }).png().toBuffer();
  const grid: string[] = [];
  for (let n = 0; n < 1024; n += 50) grid.push(`<path d="M${n} 0V1024M0 ${n}H1024" stroke="#00b9d0" opacity=".45"/><text x="${n + 1}" y="18" font-size="13">${n}</text><text x="1" y="${n + 14}" font-size="13">${n}</text>`);
  await sharp(source).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${grid.join("")}</svg>`) }]).png().toFile(path.join(dir, "source-grid.png"));
  console.log(dir);
}

async function build() {
  const id = arg("id");
  if (!/^[a-z0-9-]{3,60}$/.test(id)) throw new Error("Unique safe --id required");
  const planFile = arg("plan", path.join(ROOT, "draft-plan.json"));
  const planBytes = readFileSync(planFile);
  const plan = JSON.parse(planBytes.toString()) as { boardFile: string; spriteFile: string; spriteFileSha256: string; source: SpriteSource; contract: FixedSlotContract; annotation: { comparators: string; method: string } };
  const boardBytes = readFileSync(plan.boardFile), spriteBytes = readFileSync(plan.spriteFile);
  const boardMeta = await sharp(boardBytes).metadata();
  if (sha256Bytes(boardBytes) !== plan.contract.board.sha256 || boardMeta.width !== plan.contract.board.width || boardMeta.height !== plan.contract.board.height) throw new Error("Board differs from frozen plan");
  if (sha256Bytes(spriteBytes) !== plan.spriteFileSha256) throw new Error("Sprite differs from recorded source");
  const raw = await sharp(spriteBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dir = path.join(ROOT, id);
  if (existsSync(dir)) throw new Error("Build already exists; never overwrite evidence");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "plan.json"), planBytes, { flag: "wx" });
  const autoPath = arg("observation");
  // This visual review belongs only to the one source inspected for this pilot.
  // A new child/source needs its own recorded review, never this sample's approval.
  if (!autoPath && plan.spriteFileSha256 !== "818e74bb3984dd84818e2ae322a4e64ab567513f7d44cfd6f9a6642fe6f4deb7") throw new Error("No manual visual review exists for this source image");
  let source = plan.source;
  let review = { sourceSha256: sha256Rgba(raw.data, raw.info.width, raw.info.height), cellId: "seated", figureCount: 1, extraProps: false, poseMatches: true, completeFigure: true, reviewer: "Codex visual inspection, not a human approval", note: "One complete seated figure with winter clothes and no props. Style accepted as pilot direction by user; contact coordinates are manually estimated." };
  let observation: Record<string, unknown> | undefined;
  if (autoPath) {
    const o = JSON.parse(readFileSync(autoPath, "utf8"));
    if (!o.approved || o.costUnknown || !o.source || o.sourceImage.sha256 !== plan.spriteFileSha256 || !o.wireMatchesRecordedInput) throw new Error("Automatic observation is not usable; no guessed fallback");
    source = o.source;
    review = { ...review, reviewer: `${o.modelReturned}:${o.promptVersion}`, note: o.reason, figureCount: o.observation.figureCount, extraProps: o.observation.extraProps, poseMatches: o.observation.poseMatches, completeFigure: o.observation.completeFigure };
    observation = { file: autoPath, sha256: sha256Bytes(readFileSync(autoPath)), requestId: o.requestId, source: o.source };
  }
  const extracted = extractSpriteCell({ rgba: raw.data, width: raw.info.width, height: raw.info.height, grid: { cells: [{ id: "seated", left: 0, top: 0, width: raw.info.width, height: raw.info.height }], clearancePx: 2 }, cellId: "seated", source, review });
  const candidate = computeFixedPlacement({ contract: plan.contract, board: plan.contract.board, sprite: extracted });
  const pivot = plan.contract.support.destination;
  const sourceSeat = source.landmarks.seatContact!;
  const grownScale = candidate.transform.scale * 1.5;
  const cases = [
    { id: "candidate", title: autoPath ? "הצבה לפי מדידה אוטומטית" : "מועמד — סימון גוף ידני, הצבה בקוד", value: candidate, expected: {}, corruption: null },
    { id: "floating", title: "ביקורת שלילית — הורמה ב־45 פיקסלים", value: evaluateFixedPlacement({ contract: plan.contract, board: plan.contract.board, sprite: extracted, transform: { ...candidate.transform, translateY: candidate.transform.translateY - 45 } }), expected: { bodyPlacement: "fail" }, corruption: { dy: -45 } },
    { id: "oversized", title: "ביקורת שלילית — גדלה פי 1.5 סביב המושב", value: evaluateFixedPlacement({ contract: plan.contract, board: plan.contract.board, sprite: extracted, transform: { scale: grownScale, translateX: pivot.x * plan.contract.board.width - sourceSeat.x * raw.info.width * grownScale, translateY: pivot.y * plan.contract.board.height - sourceSeat.y * raw.info.height * grownScale } }), expected: { relativeScale: "fail" }, corruption: { scaleFactor: 1.5, pivot: "unchanged seat" } },
  ];
  const native = await sharp(candidate.sourceImage.rgba, { raw: { width: candidate.sourceImage.width, height: candidate.sourceImage.height, channels: 4 } }).png().toBuffer();
  writeFileSync(path.join(dir, "sprite-native.png"), native, { flag: "wx" });
  writeFileSync(path.join(dir, "base.webp"), boardBytes, { flag: "wx" });
  await sharp(boardBytes).extract(WINDOW).png().toFile(path.join(dir, "original.png"));
  const summaries: Array<{ id: string; title: string; ok: boolean; flags: FixedPlacement["flags"]; transform: FixedPlacement["transform"]; nativeTransform: FixedPlacement["transform"]; measurements: FixedPlacement["measurements"]; contractHash: string }> = [];
  for (const c of cases) {
    const sub = path.join(dir, c.id);
    mkdirSync(sub);
    const p = c.value.composite;
    const png = await sharp(p.rgba, { raw: { width: p.width, height: p.height, channels: 4 } }).png().toBuffer();
    writeFileSync(path.join(sub, "patch.png"), png, { flag: "wx" });
    const full = await sharp(boardBytes).composite([{ input: png, left: p.left, top: p.top }]).png().toBuffer();
    await sharp(full).extract(WINDOW).png().toFile(path.join(sub, "context.png"));
    await sharp(full).resize(1536, 1024).png().toFile(path.join(sub, "board.png"));
    const contractHash = createHash("sha256").update(JSON.stringify(plan.contract)).digest("hex");
    const manifest = { ...fixedPlacementManifest(c.value, extracted), planSha256: sha256Bytes(planBytes), contractSha256: contractHash, sourceFileSha256: plan.spriteFileSha256, annotationMethod: autoPath ? "automatic source observation; same manual board recipe" : plan.annotation.method, observation, intentionallyCorrupted: c.corruption, visualApproval: "pending-human-review" };
    json(path.join(sub, "manifest.json"), manifest);
    json(path.join(sub, "judge-case.json"), { patch: path.join(sub, "patch.png"), composite: path.join(sub, "context.png"), identity: "work/codex-judge-audit-20260908/pilot/sheet.png", childName: "Yuval", ageYears: 8, recipe: { pose: "seated", support: "Sitting on the top of the blue parcel on the foreground cargo sledge. Buttocks must touch its top. Boots may dangle in front of the cargo; there is no requirement to stand on the snow.", occlusion: "Open seated figure, no occlusion mask. No existing person's face may be covered.", occlusionMode: "open", comparators: plan.annotation.comparators }, expectedChecks: c.expected, provenance: { manifestFile: path.join(sub, "manifest.json"), contractHash, contextSha256: sha256Bytes(readFileSync(path.join(sub, "context.png"))), note: "Expected controls and labels are local metadata, not sent to judge. Candidate is not an approved positive." } });
    summaries.push({ id: c.id, title: c.title, ok: c.value.ok, flags: c.value.flags, transform: c.value.transform, nativeTransform: c.value.sourceImage.transform, measurements: c.value.measurements, contractHash });
  }
  json(path.join(dir, "summary.json"), { mode: autoPath ? "automatic" : "manual", source, extracted: { ok: extracted.ok, measurements: extracted.measurements, flags: extracted.flags }, planFile, cases: summaries });
  const cards = cases.map((c, i) => {
    const tr = c.value.sourceImage.transform;
    const w = c.value.sourceImage.width * tr.scale, h = c.value.sourceImage.height * tr.scale;
    return `<article><h2>${escape(c.title)}</h2><p>בדיקות קוד: ${c.value.ok ? "עברו — אינן אישור חזותי" : "נפסל"}</p><img class="context" src="${c.id}/context.png" alt="${escape(c.title)}"/><details><summary>מקור חד באותו מיקום — ניתן לגלול</summary><div class="scroll"><div class="scene" style="width:920px;height:688px;background-image:url(base.webp);background-size:3072px 2048px;background-position:-1500px -1360px"><img src="sprite-native.png" style="position:absolute;max-width:none;left:${tr.translateX - WINDOW.left}px;top:${tr.translateY - WINDOW.top}px;width:${w}px;height:${h}px"/></div></div></details><pre dir="ltr">${escape(JSON.stringify(summaries[i]!.measurements, null, 2))}</pre><p><a href="${c.id}/board.png">בורד מלא</a> · <a href="${c.id}/manifest.json">ראיות ונתונים</a></p></article>`;
  }).join("");
  writeFileSync(path.join(dir, "REVIEW_HE.html"), `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>פיילוט ישיבה — אנטארקטיקה</title><style>body{font:18px/1.6 system-ui;background:#f4f1ea;color:#171629;margin:0;padding:24px}main{max-width:1260px;margin:auto}article{background:white;padding:22px;border-radius:20px;margin:24px 0}.context{width:100%;height:auto}.scroll{overflow:auto;direction:ltr}.scene{position:relative;overflow:hidden}pre{font:13px/1.4 monospace;overflow:auto;max-height:190px;background:#f5f5f7;padding:16px}h1{font-size:32px}a{color:#284e8b}</style><main><h1>הצבה אחת, אותה דמות ואותו בורד</h1><p>זהו פיילוט מקומי, לא משחק שפורסם. ${autoPath ? "נקודות הדמות זוהו במודל ללא נתוני הבורד; המתכון בבורד עדיין סומן ידנית." : "נקודות הדמות והמקום סומנו ידנית בידי Codex. קנה המידה, ההזזה ובדיקות הגבולות חושבו בקוד."} אין אישור אנושי או הבטחה שהמועמד תקין. שני מקרי הכשל הוכנו במכוון והם נבדקים נגד אותו מתכון בדיוק.</p><details><summary>הבורד המקורי ללא הדמות</summary><img class="context" src="original.png"/></details>${cards}<p>כל המקורות, המספרים ותוצאות הבדיקות נשמרו ליד הדוח. שום יצירת תמונה בתשלום אינה מתבצעת בכלי הזה.</p></main></html>`, { flag: "wx" });
  console.log(JSON.stringify({ dir, extracted: extracted.ok, cases: summaries.map(c => ({ id: c.id, ok: c.ok, errors: c.flags.filter(f => f.severity === "error") })) }));
}

if (process.argv[2] === "prepare") prepare().catch(e => { console.error(e); process.exitCode = 1; });
if (process.argv[2] === "detail") detail().catch(e => { console.error(e); process.exitCode = 1; });
if (process.argv[2] === "build") build().catch(e => { console.error(e); process.exitCode = 1; });
