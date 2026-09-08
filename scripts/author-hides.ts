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
  // paris/carousel was here until 8 September 2026. The polygon "from the
  // planning run" sits on the PAVING in front of the carousel, not on its
  // fascia, and so did the contract's support point — so the layer copied
  // cobblestones and a passing child over the painted child's legs and cut
  // them in mid-air (Codex's second QA, `images/carousel-mask.png`). It is an
  // ordinary standing spot on the square now, with no foreground of its own;
  // the contract keeps the size that was measured against the riders.
  {
    // paris/awning, 8 September 2026. The spot used to be "in front of the
    // outer café easel" in the open, and the accepted render stood her on top
    // of the girl in the blue dress. Now she stands BEHIND the easel: her head
    // shows above the canvas, her legs between its tripod legs. The polygon
    // is the canvas, the tray and the three legs as one shape (the legs are
    // teeth off the tray), traced at 3x on the board.
    slug: "paris", target: "awning", pose: "standing",
    foot: px(880, 1880), bodyHeight: 0.185,
    occluder: [
      px(815, 1600), px(958, 1568), px(972, 1790), // canvas: top-left, top-right, bottom-right
      px(985, 1885), px(972, 1885), px(955, 1802), // right leg down and back up
      px(913, 1802), px(911, 1885), px(898, 1885), px(898, 1802), // middle leg
      px(840, 1804), px(814, 1885), px(801, 1885), px(826, 1806), // left leg
      px(830, 1815), // canvas bottom-left
    ],
    object: "the painter's easel with its canvas and tripod legs",
    support: "Hidden shoes on the cobblestones behind the easel's legs.",
    occlusion: "The painter's easel, drawn back in front of the child from the board, hides her from the neck down except what shows between its legs; her head shows above the canvas.",
  },
  // sydney/ferry was here until 8 September 2026: a bust at the bow came back
  // three times the size of the ferry's passengers, whose heads are ~40 px on
  // this art — no child-sized child is recognisable at that depth. The spot
  // moved under the lifeguard chair (scripts/install-contracts.ts); Sydney's
  // foreground layer is written without the hull.
];

/** The foreground file is written beside the base under this tag, so an archived scene version keeps its own layer. */
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.slice(6) ?? "";

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
    const scene = JSON.parse(readFileSync(scenePath, "utf8")) as { version: number; art: { width: number; height: number; base: string; foreground?: string }; targets: Array<{ id: string; slots: Array<Record<string, unknown> & { x: number; y: number; scale: number; hintZone: { x: number; y: number; r: number }; placement?: Record<string, unknown> & { contract?: { standingHeight: number } } }> }> };
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
        // A slot that already carries a placement contract is governed by it.
        // This script's `bodyHeight` is the number that was measured when the
        // hide was first traced, and it is older: the carousel still says
        // .1099 here where the contract says .147. Replacing the whole
        // `placement` object would also delete the contract outright. Both
        // happened to be true on 8 September 2026 (Codex's second QA), so a
        // disagreement is refused rather than silently written, and the
        // contract is carried across.
        const contract = slot.placement?.contract;
        const bodyHeight = contract?.standingHeight ?? h.bodyHeight;
        if (contract && Math.abs(contract.standingHeight - h.bodyHeight) / contract.standingHeight > 0.15) {
          throw new Error(`${slug}/${h.target}: HIDES says bodyHeight ${h.bodyHeight} but the slot's contract says standingHeight ${contract.standingHeight}. Update the HIDES row (or the contract) deliberately; this script will not overwrite a measured contract.`);
        }
        const scale = Math.round(Math.min(0.25, Math.max(0.03, bodyHeight)) * 10000) / 10000;
        const y = Math.round((h.foot.y - bodyHeight / 2) * 10000) / 10000;
        Object.assign(slot, { x: h.foot.x, y, scale, layer: "behindForeground", hintZone: { ...slot.hintZone, x: h.foot.x, y: Math.round(Math.max(0, y - 0.015) * 10000) / 10000 } });
        slot.placement = {
          ...(contract ? { contract } : {}),
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
      const fgRel = `${path.dirname(art.base)}/foreground${TAG ? `-${TAG}` : ""}.webp`;
      writeFileSync(path.join(ROOT, "public", fgRel), await sharp(layer).webp({ quality: 92, alphaQuality: 100 }).toBuffer());
      scene.art.foreground = fgRel;
      writeFileSync(scenePath, JSON.stringify(scene, null, 2) + "\n");
      console.log(`${slug}: foreground layer written to ${fgRel}`);
      // This script edits a live scene in place. It does not archive the old
      // version or bump `version`, and a game pinned to the old version would
      // then resolve the NEW slots against its own art. Whoever runs it has to
      // do that afterwards; saying so here is the least this can do.
      console.warn(`${slug}: version ${scene.version} was edited IN PLACE. Archive the previous definition into content/scenes/releases/ and bump "version" before any game is generated, or a pinned game will resolve today's slots.`);
    }
  }
  if (!WRITE) console.log(`overlays in ${path.relative(ROOT, OUT)}; pass --write to install`);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
