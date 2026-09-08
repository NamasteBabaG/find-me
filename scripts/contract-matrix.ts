/**
 * The first world's 27 A spots, one picture each, for a person to measure the
 * neighbours against what the slot asks for. No renders bought.
 *
 *   npx tsx scripts/contract-matrix.ts [--out=work/contract-matrix]
 *
 * Each picture is the board around the spot at 2x with: the asked standing
 * height as a cyan bar at the slot's x (from `scale`); the contract's
 * standing height as a green bar at the support point, when there is one;
 * the paint ellipse; the occluder polygon; art-pixel gridlines every 100 px.
 * The console prints the asked height in art pixels per spot and, with a
 * contract, the expected visible height.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { sceneBySlug } from "../src/services/scene-catalog.service";
import { contractPx, occlusionMode, slotContext } from "../src/services/generation/patch";

const WORLD_ONE = ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"];
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "work/contract-matrix";
mkdirSync(out, { recursive: true });

async function main() {
  const rows: string[] = [];
  for (const slug of WORLD_ONE) {
    const scene = sceneBySlug(slug);
    const art = { width: scene.art.width, height: scene.art.height };
    const base = await sharp(path.join(process.cwd(), "public", scene.art.base)).png().toBuffer();
    for (const target of scene.targets) {
      const slot = target.slots[0];
      const ctx = slotContext(art, slot);
      const asked = ctx.childPx;
      const c = contractPx(slot, art);
      const cx = slot.x * art.width, cy = slot.y * art.height;
      const win = Math.round(Math.max(asked * 3.5, 500));
      const X = Math.max(0, Math.min(art.width - win, Math.round(cx - win / 2)));
      const Y = Math.max(0, Math.min(art.height - win, Math.round(cy - win / 2)));
      const z = win > 700 ? 1 : 2;
      const P = (x: number, y: number) => `${((x - X) * z).toFixed(1)},${((y - Y) * z).toFixed(1)}`;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${win * z}" height="${win * z}">`;
      for (let g = Math.ceil(X / 100) * 100; g < X + win; g += 100) svg += `<line x1="${(g - X) * z}" y1="0" x2="${(g - X) * z}" y2="${win * z}" stroke="#fff" stroke-opacity="0.35"/><text x="${(g - X) * z + 2}" y="12" font-size="11" fill="#fff" font-family="Arial">${g}</text>`;
      for (let g = Math.ceil(Y / 100) * 100; g < Y + win; g += 100) svg += `<line x1="0" y1="${(g - Y) * z}" x2="${win * z}" y2="${(g - Y) * z}" stroke="#fff" stroke-opacity="0.35"/><text x="2" y="${(g - Y) * z - 2}" font-size="11" fill="#fff" font-family="Arial">${g}</text>`;
      // The paint ellipse and the asked height.
      svg += `<ellipse cx="${(cx - X) * z}" cy="${(cy - Y) * z}" rx="${asked * 0.55 * z}" ry="${asked * 0.8 * z}" fill="none" stroke="#00e5ff" stroke-dasharray="6 4" stroke-width="2"/>`;
      svg += `<line x1="${(cx - X) * z}" y1="${(cy - asked / 2 - Y) * z}" x2="${(cx - X) * z}" y2="${(cy + asked / 2 - Y) * z}" stroke="#00e5ff" stroke-width="4"/>`;
      svg += `<text x="${(cx - X) * z + 6}" y="${(cy - asked / 2 - Y) * z + 14}" font-size="14" fill="#00e5ff" font-family="Arial">asked ${asked}px</text>`;
      const poly = slot.placement?.foreground;
      if (poly) svg += `<polygon points="${poly.map((p) => P(p.x * art.width, p.y * art.height)).join(" ")}" fill="#ff00ff" fill-opacity="0.25" stroke="#ff00ff" stroke-width="2"/>`;
      const sp = slot.placement?.contract?.supportPoint;
      if (c && sp) {
        const sx = sp.x * art.width, sy = sp.y * art.height;
        svg += `<line x1="${(sx - X) * z}" y1="${(sy - c.standing - Y) * z}" x2="${(sx - X) * z}" y2="${(sy - Y) * z}" stroke="#39ff14" stroke-width="4"/>`;
        svg += `<circle cx="${(sx - X) * z}" cy="${(sy - Y) * z}" r="6" fill="#39ff14"/>`;
        svg += `<text x="${(sx - X) * z + 6}" y="${(sy - Y) * z - 6}" font-size="14" fill="#39ff14" font-family="Arial">contract ${c.standing}px, shows ${c.visible}px</text>`;
      }
      svg += "</svg>";
      const file = path.join(out, `${slug}-${target.id}.png`);
      await sharp(base).extract({ left: X, top: Y, width: win, height: win }).resize(win * z, win * z, { kernel: "lanczos3" }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(file);
      const line = `${slug}/${target.id}: asked ${asked}px (scale ${slot.scale}) · mode ${occlusionMode(slot)} · pose ${slot.placement?.pose ?? "-"}${c ? ` · contract standing ${c.standing}px visible ${c.visible}px` : " · no contract"} → ${path.relative(process.cwd(), file)}`;
      rows.push(line);
      console.log(line);
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
