/**
 * Hand-authored hiding places for the first world: where the child's whole
 * body stands, and the exact object in front of her, traced along the board's
 * own pixels. The object is copied out of the board into the scene's
 * foreground layer, the slot is marked `behindForeground`, and the painter is
 * asked for a complete child in the open — the kind of spot that always
 * worked — while the board itself does the hiding.
 *
 * newyork/bench is not here: a bench has gaps between its slats, and the board
 * shows through them instead of her dress; that spot went back to version 2.
 *
 * The table is the asset: it is checked by eye on the overlays this script
 * renders, and it serves every child painted into these boards.
 *
 *   npx tsx scripts/author-hides.ts                 # overlays into work/occluders/author/
 *   npx tsx scripts/author-hides.ts --write         # scenes + foreground layers
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const OUT = path.join(ROOT, "work", "occluders", "author");

interface Point { x: number; y: number }
interface Hide {
  slug: string;
  target: string;
  pose: "standing" | "seated" | "crouching";
  /** Where the feet (or the seat) touch, art fractions, and the body's full height. */
  foot: Point;
  bodyHeight: number;
  /** The object in front of the child, traced on the board (art fractions, clockwise). */
  occluder: Point[];
  /** What the object is, for the painter and for the record. */
  object: string;
  support: string;
  occlusion: string;
}

/** Art fractions from board pixels on the 3072x2048 refreshed art. */
const px = (x: number, y: number): Point => ({ x: Math.round((x / 3072) * 10000) / 10000, y: Math.round((y / 2048) * 10000) / 10000 });

export const HIDES: Hide[] = [
  {
    slug: "giza", target: "stones", pose: "standing",
    foot: px(1900, 1660), bodyHeight: 0.14,
    // The inscribed block in front, its whole visible face.
    occluder: [px(1730, 1531), px(1818, 1460), px(2037, 1528), px(2037, 1702), px(1969, 1738), px(1745, 1673)],
    object: "the large inscribed stone block",
    support: "Hidden shoes on the sand behind the large inscribed block.",
    occlusion: "The large inscribed stone block, drawn back in front of the child from the board, hides her from the chest down; the head and shoulders show above it.",
  },
  {
    slug: "paris", target: "bakery", pose: "standing",
    foot: px(2750, 1880), bodyHeight: 0.166,
    // The wicker basket of loaves with the flowers at its right.
    occluder: [px(2635, 1730), px(2648, 1695), px(2680, 1668), px(2715, 1655), px(2745, 1670), px(2778, 1638), px(2812, 1652), px(2842, 1688), px(2860, 1730), px(2858, 1910), px(2634, 1910)],
    object: "the wicker basket of baguettes",
    support: "Hidden shoes on the cobblestones behind the wicker basket of baguettes.",
    occlusion: "The wicker basket of baguettes, drawn back in front of the child from the board, hides her from the waist down; the head, shoulders and chest show above it against the bakery window.",
  },
  {
    slug: "paris", target: "carousel", pose: "standing",
    foot: { x: 0.6071, y: 0.5371 }, bodyHeight: 0.1099,
    // The carousel's red-and-gold fascia and deck edge, from the planning run.
    occluder: [{ x: 0.5853, y: 0.5215 }, { x: 0.5924, y: 0.5166 }, { x: 0.6022, y: 0.52 }, { x: 0.6136, y: 0.5161 }, { x: 0.625, y: 0.5215 }, { x: 0.6283, y: 0.5762 }, { x: 0.5859, y: 0.5762 }],
    object: "the carousel's red-and-gold fascia",
    support: "Both shoes on the carousel deck behind its front fascia.",
    occlusion: "The carousel fascia, drawn back in front of the child from the board, hides her shoes and shins; the rest of her shows above it among the riders.",
  },
  {
    slug: "sydney", target: "ferry", pose: "standing",
    foot: { x: 0.434, y: 0.423 }, bodyHeight: 0.078,
    // The ferry's green bow hull, from the planning run.
    occluder: [{ x: 0.408, y: 0.411 }, { x: 0.414, y: 0.399 }, { x: 0.427, y: 0.402 }, { x: 0.441, y: 0.405 }, { x: 0.452, y: 0.409 }, { x: 0.452, y: 0.447 }, { x: 0.438, y: 0.451 }, { x: 0.423, y: 0.446 }, { x: 0.411, y: 0.435 }],
    object: "the ferry's green bow hull",
    support: "Both shoes on the ferry's bow deck behind the green hull and its rail.",
    occlusion: "The green bow hull, drawn back in front of the child from the board, hides her from the waist down; the head, shoulders and chest show above the rail.",
  },
];

function svgPolygon(points: Point[], art: { width: number; height: number }, offset: Point, grow = 0): string {
  const pts = points.map((p) => `${(p.x * art.width - offset.x).toFixed(1)},${(p.y * art.height - offset.y).toFixed(1)}`).join(" ");
  const stroke = grow > 0 ? ` stroke="#fff" stroke-width="${grow * 2}" stroke-linejoin="round"` : "";
  return `<polygon points="${pts}" fill="#fff"${stroke}/>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const byScene = new Map<string, Hide[]>();
  for (const h of HIDES) byScene.set(h.slug, [...(byScene.get(h.slug) ?? []), h]);
  for (const [slug, hides] of byScene) {
    const scenePath = path.join(ROOT, "content", "scenes", slug, "scene.json");
    const scene = JSON.parse(readFileSync(scenePath, "utf8")) as { art: { width: number; height: number; base: string; foreground?: string }; targets: Array<{ id: string; slots: Array<Record<string, unknown> & { x: number; y: number; scale: number; hintZone: { x: number; y: number; r: number }; placement?: Record<string, unknown> }> }> };
    const art = scene.art;
    const base = sharp(path.join(ROOT, "public", art.base));
    const baseBuf = await base.png().toBuffer();
    const baseRaw = await sharp(baseBuf).removeAlpha().raw().toBuffer();
    let layer = await sharp({ create: { width: art.width, height: art.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    for (const h of hides) {
      const target = scene.targets.find((t) => t.id === h.target);
      if (!target) throw new Error(`${slug}/${h.target}: no such target`);
      const slot = target.slots[0]!;
      // The cut-out: the board's pixels inside the polygon, edge softened by one pixel.
      const cut = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}"><rect width="100%" height="100%" fill="#000"/>${svgPolygon(h.occluder, art, { x: 0, y: 0 })}</svg>`);
      const alpha = await sharp(cut).extractChannel(0).blur(0.6).raw().toBuffer();
      // Joined onto RAW pixels: joined onto a PNG input the band is not read as alpha and the piece comes out opaque.
      const piece = await sharp(baseRaw, { raw: { width: art.width, height: art.height, channels: 3 } }).joinChannel(alpha, { raw: { width: art.width, height: art.height, channels: 1 } }).png().toBuffer();
      layer = await sharp(layer).composite([{ input: piece, left: 0, top: 0 }]).png().toBuffer();
      // Overlay for the eye: the body box, the head, the polygon.
      const bodyH = h.bodyHeight * art.height, bodyW = bodyH * 0.45;
      const cx = h.foot.x * art.width, fy = h.foot.y * art.height;
      const win = { x: Math.max(0, Math.round(cx - bodyH)), y: Math.max(0, Math.round(fy - bodyH * 1.6)), w: Math.round(bodyH * 2), h: Math.round(bodyH * 2.2) };
      win.w = Math.min(win.w, art.width - win.x); win.h = Math.min(win.h, art.height - win.y);
      // sharp resizes BEFORE it composites whatever the call order, so the
      // window is enlarged first and the overlays are drawn at the enlarged scale.
      const z = Math.max(1, Math.min(3, Math.floor(900 / win.w)));
      const zoomed = await sharp(baseBuf).extract({ left: win.x, top: win.y, width: win.w, height: win.h }).resize({ width: win.w * z, kernel: "nearest" }).png().toBuffer();
      const zp = (points: Point[]) => points.map((p) => `${((p.x * art.width - win.x) * z).toFixed(1)},${((p.y * art.height - win.y) * z).toFixed(1)}`).join(" ");
      const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${win.w * z}" height="${win.h * z}">
        <rect x="${(cx - bodyW / 2 - win.x) * z}" y="${(fy - bodyH - win.y) * z}" width="${bodyW * z}" height="${bodyH * z}" fill="none" stroke="#00e5ff" stroke-width="2"/>
        <circle cx="${(cx - win.x) * z}" cy="${(fy - bodyH * 0.87 - win.y) * z}" r="${bodyH * 0.13 * z}" fill="none" stroke="#00e5ff" stroke-width="2"/>
        <polygon points="${zp(h.occluder)}" fill="#ff00ff" fill-opacity="0.35" stroke="#ff00ff" stroke-width="2"/>
      </svg>`;
      await sharp(zoomed).composite([{ input: Buffer.from(overlay), left: 0, top: 0 }]).png().toFile(path.join(OUT, `${slug}-${h.target}.png`));
      // A test: a magenta body behind the cut-out, to see the hide at a glance.
      const body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${win.w * z}" height="${win.h * z}"><rect x="${(cx - bodyW / 2 - win.x) * z}" y="${(fy - bodyH - win.y) * z}" width="${bodyW * z}" height="${bodyH * z}" rx="${(bodyW * z) / 3}" fill="#ff00ff" fill-opacity="0.8"/></svg>`);
      const fgWin = await sharp(layer).extract({ left: win.x, top: win.y, width: win.w, height: win.h }).resize({ width: win.w * z, kernel: "nearest" }).png().toBuffer();
      writeFileSync(path.join(OUT, `${slug}-${h.target}.fg.png`), fgWin);
      await sharp(zoomed).composite([{ input: body, left: 0, top: 0 }, { input: fgWin, left: 0, top: 0 }]).png().toFile(path.join(OUT, `${slug}-${h.target}.hide.png`));
      if (WRITE) {
        const scale = Math.round(Math.min(0.25, Math.max(0.03, h.bodyHeight)) * 10000) / 10000;
        const y = Math.round((h.foot.y - h.bodyHeight / 2) * 10000) / 10000;
        Object.assign(slot, { x: h.foot.x, y, scale, layer: "behindForeground", hintZone: { ...slot.hintZone, x: h.foot.x, y: Math.round(Math.max(0, y - 0.015) * 10000) / 10000 } });
        slot.placement = {
          pose: h.pose,
          support: h.support,
          occlusion: h.occlusion,
          instructions: `Paint the child complete and unoccluded, ${h.pose} at this spot exactly as if ${h.object} were not there: the whole head, torso and arms, and the legs down to the feet on the ground. ${h.object} is put back in front of the child afterwards from the board itself; do not paint it over the child, and do not paint any part of the child as hidden.`,
          foreground: h.occluder,
        };
      }
      console.log(`${slug}/${h.target}: ${h.pose}, body ${h.bodyHeight} at ${h.foot.x},${h.foot.y}; occluder ${h.occluder.length} points`);
    }
    if (WRITE) {
      const fgRel = `${path.dirname(art.base)}/foreground.webp`;
      writeFileSync(path.join(ROOT, "public", fgRel), await sharp(layer).webp({ quality: 92, alphaQuality: 100 }).toBuffer());
      scene.art.foreground = fgRel;
      writeFileSync(scenePath, JSON.stringify(scene, null, 2) + "\n");
      console.log(`${slug}: foreground layer written to ${fgRel}`);
    }
  }
  if (!WRITE) console.log(`overlays in ${path.relative(ROOT, OUT)}; pass --write to install`);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
