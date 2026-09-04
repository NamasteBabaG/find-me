/**
 * Puts every finished hiding spot back on the board it was cut from, and tiles
 * them into one sheet to look at.
 *
 *   npx tsx scripts/patch-sheet.ts --dir=work/w2 [--out=work/sheet.png] [--pad=70] [--cols=5]
 *   npx tsx scripts/patch-sheet.ts --game=game_xxx      the same, for a real game
 *
 * `--dir` reads what an authoring run left on disk; `--game` reads a finished
 * game out of the database, which is the only way to look at a child that a
 * parent uploaded. Point DATABASE_URL at whichever environment holds it.
 *
 * This is the last step before a world goes on sale, and it is not optional.
 * Geometry and the judge between them are a filter, not a guarantee: across one
 * world's twenty-seven spots the rules passed six patches that were broken, and
 * the sixth only showed itself when a patch was blown up seven times.
 *
 * It has to be the board, not a white background. A patch holds only the pixels
 * the model changed, so on white it shows every scrap of scenery it dragged
 * along and every part of the child an occluder hid — a girl peeking out of a
 * reef looks like a severed head, and a girl in a lit doorway looks like she is
 * trailing a lump of rubble. Composited back, both are exactly right, because
 * the scenery lands on the identical scenery it came from. Judging patches on
 * white had me rejecting good hiding places and loosening the rules to let bad
 * ones through.
 *
 * Reads whatever `slot-patch generate --out=<dir>` left behind: each patch is a
 * .webp beside a .json holding its slug and its rect in board pixels.
 */
import sharp from "sharp";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

interface Sidecar {
  slug: string;
  targetId: string;
  variant: string;
  rect: { x: number; y: number; w: number; h: number };
}

interface Job {
  label: string;
  slug: string;
  rect: Sidecar["rect"];
  read: () => Promise<Buffer>;
}

/** Every finished hiding spot of one game, straight from the database. */
async function fromGame(gameId: string): Promise<Job[]> {
  const [{ getContainer }, { readAssetBuffer }] = await Promise.all([import("../src/services/container"), import("../src/services/asset.service")]);
  const c = getContainer();
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } }, status: { in: ["GENERATED", "APPROVED"] }, assetId: { not: null } },
    include: { targetInstance: { include: { gameScene: { select: { sceneSlug: true, orderIndex: true } } } } },
    orderBy: [{ targetInstance: { gameScene: { orderIndex: "asc" } } }, { createdAt: "asc" }],
  });
  const out: Job[] = [];
  for (const r of rows) {
    if (!r.rectJson) continue;
    const slug = r.targetInstance.gameScene.sceneSlug;
    const board = await sharp(path.join(ROOT, "public", "scenes", slug, "base.webp")).metadata();
    // The database keeps the rect in art fractions; the sheet works in pixels.
    const n = JSON.parse(r.rectJson) as { x: number; y: number; w: number; h: number };
    const assetId = r.assetId as string;
    out.push({
      label: `${slug}/${r.targetInstance.targetId}/${r.variant}`,
      slug,
      rect: {
        x: Math.round(n.x * (board.width ?? 0)),
        y: Math.round(n.y * (board.height ?? 0)),
        w: Math.round(n.w * (board.width ?? 0)),
        h: Math.round(n.h * (board.height ?? 0)),
      },
      read: async () => sharp(await readAssetBuffer(c, assetId)).png().toBuffer(),
    });
  }
  return out;
}

async function main() {
  const gameId = flag("game", "");
  const dirs = flag("dir", "").split(",").filter(Boolean);
  if (!dirs.length && !gameId) throw new Error("usage: npx tsx scripts/patch-sheet.ts --dir=work/w2[,work/fix] | --game=game_xxx [--out=…]");
  const pad = Number(flag("pad", "70"));
  const cols = Number(flag("cols", "5"));
  const cell = Number(flag("cell", "300"));
  const out = path.resolve(ROOT, flag("out", "work/patch-sheet.png"));

  // A spot can be re-rendered into a second folder after a slot moves, and the
  // later folder is the one that counts — the sheet has to show what would ship.
  const found = new Map<string, { dir: string; name: string; meta: Sidecar }>();
  for (const dir of dirs) {
    const abs = path.resolve(ROOT, dir);
    for (const f of readdirSync(abs).filter((n) => n.endsWith(".json"))) {
      const meta = JSON.parse(readFileSync(path.join(abs, f), "utf8")) as Sidecar;
      found.set(`${meta.slug}/${meta.targetId}/${meta.variant}`, { dir: abs, name: f.slice(0, -5), meta });
    }
  }
  const keys = [...found.keys()].sort();
  const jobs: Job[] = [
    ...keys.map((key) => {
      const { dir, name, meta } = found.get(key)!;
      return { label: key, slug: meta.slug, rect: meta.rect, read: async () => sharp(path.join(dir, `${name}.webp`)).png().toBuffer() };
    }),
    ...(gameId ? await fromGame(gameId) : []),
  ];
  if (!jobs.length) throw new Error(gameId ? `no finished hiding spots in ${gameId}` : `no patches in ${dirs.join(", ")}`);

  // A fresh pipeline per patch: a sharp instance carries the operations queued
  // on it, so reusing one board across nine spots composites nine children.
  const sizes = new Map<string, { width: number; height: number }>();
  const tiles: Buffer[] = [];
  for (const job of jobs) {
    const meta = { slug: job.slug, rect: job.rect };
    const boardPath = path.join(ROOT, "public", "scenes", meta.slug, "base.webp");
    if (!sizes.has(meta.slug)) {
      const m = await sharp(boardPath).metadata();
      sizes.set(meta.slug, { width: m.width ?? 0, height: m.height ?? 0 });
    }
    const { width, height } = sizes.get(meta.slug)!;
    const left = Math.max(0, meta.rect.x - pad);
    const top = Math.max(0, meta.rect.y - pad);
    const crop = {
      left,
      top,
      width: Math.min(width, meta.rect.x + meta.rect.w + pad) - left,
      height: Math.min(height, meta.rect.y + meta.rect.h + pad) - top,
    };
    const patch = await job.read();
    const onBoard = await sharp(boardPath)
      .composite([{ input: patch, left: meta.rect.x, top: meta.rect.y }])
      .png()
      .toBuffer();
    tiles.push(await sharp(onBoard).extract(crop).resize(cell, cell, { fit: "inside" }).png().toBuffer());
  }

  const rows = Math.ceil(tiles.length / cols);
  const cw = cell + 8;
  const ch = cell + 8;
  const sheet = await sharp({ create: { width: cols * cw, height: rows * ch, channels: 3, background: "#ffffff" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * cw + 4, top: Math.floor(i / cols) * ch + 4 })))
    .png()
    .toBuffer();
  writeFileSync(out, sheet);

  console.log(`${path.relative(ROOT, out)}  ${cols}x${rows}, ${tiles.length} spots`);
  jobs.forEach((j, i) => console.log(`  ${String(i + 1).padStart(2)}. ${j.label}`));
  console.log("");
  console.log("Look at every one. A spot is only finished when it reads as a child hiding in that place.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
