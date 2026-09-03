/**
 * The node-placement board: the world map with its nine nodes, the journey
 * route and the child marker drawn on top, at the sizes a phone would use.
 *
 *   npx tsx scripts/map-check.ts journey
 *     → work/boards/map-<slug>.png          desktop
 *       work/boards/map-<slug>-portrait.png a phone, letterboxed
 *
 * The brief asks for this before final art: it is the only way to know that all
 * nine destinations, the route and the labels are legible in both orientations.
 */
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findWorld } from "../content/worlds";
import { boardSlugs, nodeFor, type WorldDefinition } from "@/domain/world";
import { findScene } from "../content/scenes";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "work", "boards");
/** The child tap target the design system requires. */
const TOUCH_KID = 64;

function overlay(world: WorldDefinition, width: number, height: number, label: boolean): Buffer {
  const order = boardSlugs(world);
  const pts = order.map((slug) => {
    const n = nodeFor(world, slug)!;
    return { slug, x: n.x * width, y: n.y * height, routeIndex: n.routeIndex };
  });
  const route = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // The tap target is a fixed number of CSS pixels, so it looks bigger on the
  // small render — which is exactly the thing worth seeing.
  const r = (TOUCH_KID / 2) * (width / 900);
  const nodes = pts
    .map((p, i) => {
      const name = findScene(p.slug)?.name.en ?? p.slug;
      const fill = i === 0 ? "#ffd166" : "#ffffff";
      return (
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" fill-opacity="0.9" stroke="#17162b" stroke-width="${(r * 0.12).toFixed(1)}"/>` +
        `<text x="${p.x.toFixed(1)}" y="${(p.y + r * 0.35).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="${(r * 0.9).toFixed(1)}" fill="#17162b">${p.routeIndex}</text>` +
        (label
          ? `<rect x="${(p.x - r * 2).toFixed(1)}" y="${(p.y + r * 1.15).toFixed(1)}" width="${(r * 4).toFixed(1)}" height="${(r * 0.8).toFixed(1)}" rx="${(r * 0.25).toFixed(1)}" fill="#17162b" fill-opacity="0.8"/>` +
            `<text x="${p.x.toFixed(1)}" y="${(p.y + r * 1.75).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="${(r * 0.5).toFixed(1)}" fill="#ffffff">${name}</text>`
          : "")
      );
    })
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<path d="${route}" fill="none" stroke="#ffffff" stroke-width="${(r * 0.28).toFixed(1)}" stroke-opacity="0.85" stroke-linecap="round" stroke-dasharray="${(r * 0.5).toFixed(1)} ${(r * 0.5).toFixed(1)}"/>` +
      nodes +
      `</svg>`,
  );
}

async function main() {
  const slug = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "journey";
  const world = findWorld(slug);
  if (!world) throw new Error(`unknown world "${slug}"`);
  const art = path.join(ROOT, "public", world.map.art.replace(/^\//, ""));
  mkdirSync(OUT, { recursive: true });

  // Desktop: the map at a realistic width.
  const wide = 1200;
  const wideH = Math.round((wide * world.map.height) / world.map.width);
  const base = await sharp(readFileSync(art)).resize(wide, wideH).png().toBuffer();
  await sharp(base).composite([{ input: overlay(world, wide, wideH, true) }]).png().toFile(path.join(OUT, `map-${slug}.png`));

  // Phone portrait: the map must be letterboxed, never cropped — every
  // destination has to stay reachable.
  const pw = 390;
  const ph = 720;
  const fitted = Math.round(pw);
  const fittedH = Math.round((fitted * world.map.height) / world.map.width);
  const inner = await sharp(readFileSync(art)).resize(fitted, fittedH).png().toBuffer();
  const withNodes = await sharp(inner).composite([{ input: overlay(world, fitted, fittedH, false) }]).png().toBuffer();
  await sharp({ create: { width: pw, height: ph, channels: 3, background: { r: 23, g: 22, b: 43 } } })
    .composite([{ input: withNodes, left: 0, top: Math.round((ph - fittedH) / 2) }])
    .png()
    .toFile(path.join(OUT, `map-${slug}-portrait.png`));

  const r = (TOUCH_KID / 2) * (fitted / 900);
  console.log(`desktop  work/boards/map-${slug}.png  (${wide}x${wideH})`);
  console.log(`portrait work/boards/map-${slug}-portrait.png  (${pw}x${ph}, map letterboxed to ${fitted}x${fittedH})`);
  console.log(`on a ${pw}px phone the map is ${fitted}px wide, so a ${TOUCH_KID}px tap target is ${(r * 2).toFixed(0)}px of the drawn map`);
  // Closest pair, in phone pixels: two nodes must never share a fingertip.
  let closest = Infinity;
  let pair = "";
  for (const a of world.nodes) {
    for (const b of world.nodes) {
      if (a.routeIndex >= b.routeIndex) continue;
      const d = Math.hypot((a.x - b.x) * fitted, (a.y - b.y) * fittedH);
      if (d < closest) {
        closest = d;
        pair = `${a.boardSlug} ↔ ${b.boardSlug}`;
      }
    }
  }
  const verdict = closest >= TOUCH_KID ? "ok" : "TOO CLOSE";
  console.log(`closest pair on a phone: ${pair} at ${closest.toFixed(0)}px (need ${TOUCH_KID}px) — ${verdict}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
