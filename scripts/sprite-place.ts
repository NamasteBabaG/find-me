/**
 * Free: cut the figures out of a transparent pose sheet and put them on the
 * board at the size and place the slot's contract asks for. No API call.
 *
 * This is the half of the sprite idea that costs nothing and decides
 * everything: if a separately drawn child lands convincingly here, the
 * expensive in-context render and its pass-two matte are both unnecessary
 * for that spot.
 *
 *   npx tsx scripts/sprite-place.ts --sheet=work/sprite-probe/sheet-....png \
 *     --board=sydney --spots=surfboards,lifeguard,rocks --out=work/sprite-probe/placed
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

function flag(name: string, fallback = ""): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

interface Box { x0: number; y0: number; x1: number; y1: number; area: number }

/** Every connected run of solid alpha, largest first: one per figure. */
function figures(alpha: Buffer, w: number, h: number, solid = 128): Box[] {
  const label = new Int32Array(w * h).fill(-1);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (alpha[i]! < solid || label[i] !== -1) continue;
    const id = boxes.length;
    const box: Box = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    stack.push(i); label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p - (p % w)) / w;
      box.area++;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (alpha[q]! >= solid && label[q] === -1) { label[q] = id; stack.push(q); }
      }
    }
    boxes.push(box);
  }
  return boxes.sort((a, b) => b.area - a.area);
}

async function main() {
  const sheetPath = flag("sheet");
  const boardSlug = flag("board", "sydney");
  const spots = flag("spots").split(",").filter(Boolean);
  const out = flag("out", "work/sprite-probe/placed");
  const stylize = process.argv.includes("--stylize");
  if (!sheetPath || !spots.length) throw new Error("--sheet and --spots are required");
  mkdirSync(out, { recursive: true });

  const { sceneBySlug } = await import("../src/services/scene-catalog.service");
  const { boardComposite } = await import("../src/services/generation/board-composite");
  const { toneMatch, keepMainBlobs } = await import("../src/services/generation/patch");

  const scene = sceneBySlug(boardSlug);
  const art = { width: scene.art.width, height: scene.art.height };
  const base = readFileSync(path.join(process.cwd(), "public", scene.art.base));
  const fg = scene.art.foreground ? readFileSync(path.join(process.cwd(), "public", scene.art.foreground)) : undefined;

  const sheet = readFileSync(sheetPath);
  const raw = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = raw.info.width, H = raw.info.height, CH = raw.info.channels;
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = raw.data[i * CH + (CH - 1)]!;
  // The figures, left to right, so cell order matches the prompt's order.
  const found = figures(alpha, W, H).filter((b) => b.area > W * H * 0.005).slice(0, spots.length * 2);
  const cells = found.sort((a, b) => a.x0 - b.x0);
  console.log(`sheet ${W}x${H}: ${cells.length} figures found — ${cells.map((c) => `${c.x1 - c.x0 + 1}x${c.y1 - c.y0 + 1}@${c.x0}`).join(", ")}`);
  if (cells.length < spots.length) console.warn(`fewer figures than spots: the sheet's cells may be touching`);

  const report: Array<Record<string, unknown>> = [];
  for (const [i, spotId] of spots.entries()) {
    const cell = cells[i];
    if (!cell) { console.warn(`${spotId}: no figure`); continue; }
    const target = scene.targets.find((t) => t.id === spotId);
    if (!target) { console.warn(`${spotId}: not in ${boardSlug}`); continue; }
    const slot = target.slots[0];
    const contract = slot.placement?.contract;
    const standingPx = Math.round((contract?.standingHeight ?? slot.scale) * art.height);
    // The sprite's own box is what shows: for a crouch or a peek that is less
    // than a standing child, and the contract already says how much less.
    const wantPx = Math.round(standingPx * (contract?.visibleFraction ?? 1));
    const cw = cell.x1 - cell.x0 + 1, chh = cell.y1 - cell.y0 + 1;
    const scale = wantPx / chh;
    const drawW = Math.max(1, Math.round(cw * scale)), drawH = Math.max(1, Math.round(chh * scale));
    // Feet (or seat, or the lowest visible part) at the support point; the
    // slot's own centre when the spot has no contract yet.
    const supportX = Math.round((contract?.supportPoint.x ?? slot.x) * art.width);
    const supportY = Math.round((contract?.supportPoint.y ?? (slot.y + slot.scale / 2)) * art.height);

    const cut = await sharp(sheet).extract({ left: cell.x0, top: cell.y0, width: cw, height: chh }).resize(drawW, drawH, { kernel: "lanczos3" }).png().toBuffer();
    // The child's own pixels pulled toward the board around her: the same
    // step the in-context path already applies after extraction.
    const cutRaw = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = drawW * drawH;
    const rgb = Buffer.alloc(n * 3), a8 = Buffer.alloc(n);
    for (let k = 0; k < n; k++) {
      rgb[k * 3] = cutRaw.data[k * 4]!; rgb[k * 3 + 1] = cutRaw.data[k * 4 + 1]!; rgb[k * 3 + 2] = cutRaw.data[k * 4 + 2]!;
      a8[k] = cutRaw.data[k * 4 + 3]!;
    }
    // The cell is a rectangle, so a neighbouring figure's fingertip can fall
    // inside it. The child is the one connected shape; a detached scrap of
    // skin beside her reads to a reviewer as an extra hand, and did
    // (8 September 2026, sprite-surfboards: anatomy failed on exactly that).
    const hard = Buffer.alloc(n);
    for (let k = 0; k < n; k++) hard[k] = a8[k]! >= 128 ? 255 : 0;
    const blobs = keepMainBlobs(hard, drawW, drawH, 0.35, drawH * 0.12);
    let dropped = 0;
    for (let k = 0; k < n; k++) if (!blobs.out[k] && a8[k]! > 0) { dropped++; a8[k] = 0; }
    if (dropped) console.log(`  dropped ${dropped}px of detached fragments from the cell`);
    // The support point is where her FEET go, so the feet are what we line up
    // with it — not the middle of her bounding box. A pose whose arm reaches
    // out to one side has its box centre away from its feet, and two cuts of
    // the same pose that differ in width would otherwise land at two different
    // places (8 September 2026: the hardened lifeguard cut was 65px wide
    // against the softer one's 75px, which walked her right foot into the
    // wooden bucket beside the chair and cost a bodyPlacement pass).
    let footSum = 0, footN = 0, lowest = 0;
    for (let k = n - 1; k >= 0; k--) if (a8[k]! >= 128) { lowest = Math.floor(k / drawW); break; }
    const footBand = Math.max(1, Math.round(drawH * 0.12));
    for (let y = Math.max(0, lowest - footBand + 1); y <= lowest; y++) {
      for (let x = 0; x < drawW; x++) if (a8[y * drawW + x]! >= 128) { footSum += x; footN++; }
    }
    const footX = footN ? footSum / footN : drawW / 2;
    const left = Math.round(supportX - footX), top = Math.round(supportY - (lowest + 1));
    const around = await sharp(base).extract({
      left: Math.max(0, Math.min(art.width - drawW, left)), top: Math.max(0, Math.min(art.height - drawH, top)),
      width: drawW, height: drawH,
    }).removeAlpha().raw().toBuffer();
    const allow = Buffer.alloc(n, 255);
    const toned = toneMatch(rgb, around, a8, allow, n);
    // The one check every sprite composite has failed is style, and the
    // reviewer names the same two things every time: the board's figures have
    // a dark ink outline and flat hard-edged shading, and the sprite has
    // neither. Both are cheap to apply here, on the child's own pixels, and
    // cost nothing. This is a measurement, not a decision: --stylize is off
    // unless asked for.
    if (stylize) {
      // Flat shading: collapse each channel onto a coarse ladder so the smooth
      // airbrushed gradients become blocks with hard edges between them.
      const step = 26;
      for (let k = 0; k < n; k++) {
        if (a8[k]! < 8) continue;
        for (let c = 0; c < 3; c++) {
          const v = toned[k * 3 + c]!;
          toned[k * 3 + c] = Math.min(255, Math.round(v / step) * step);
        }
      }
      // Ink line: every opaque pixel that touches transparency, pulled towards
      // the boards' dark brown. Its width follows the drawn size, so a 276px
      // figure gets a heavier line than a 118px one, as on the board.
      const width = Math.max(1, Math.round(drawH / 90));
      const edge = new Uint8Array(n);
      for (let y = 0; y < drawH; y++) {
        for (let x = 0; x < drawW; x++) {
          const k = y * drawW + x;
          if (a8[k]! < 128) continue;
          let border = false;
          for (let dy = -width; dy <= width && !border; dy++) {
            for (let dx = -width; dx <= width; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= drawW || yy >= drawH) { border = true; break; }
              if (a8[yy * drawW + xx]! < 128) { border = true; break; }
            }
          }
          if (border) edge[k] = 1;
        }
      }
      const ink = [58, 38, 26];
      for (let k = 0; k < n; k++) {
        if (!edge[k]) continue;
        for (let c = 0; c < 3; c++) toned[k * 3 + c] = Math.round(toned[k * 3 + c]! * 0.35 + ink[c]! * 0.65);
      }
    }
    const patch = await sharp(toned, { raw: { width: drawW, height: drawH, channels: 3 } })
      .joinChannel(a8, { raw: { width: drawW, height: drawH, channels: 1 } }).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
    writeFileSync(path.join(out, `${boardSlug}-${spotId}.webp`), patch);

    const rect = { x: left / art.width, y: top / art.height, w: drawW / art.width, h: drawH / art.height };
    const composite = await boardComposite({ base, foreground: fg, art, patch, rect, layer: slot.layer, flip: slot.flip });
    writeFileSync(path.join(out, `${boardSlug}-${spotId}.composite.png`), composite);
    const wide = await boardComposite({ base, foreground: fg, art, patch, rect, layer: slot.layer, flip: slot.flip, windowFactor: 9 });
    writeFileSync(path.join(out, `${boardSlug}-${spotId}.wide.png`), wide);

    const row = { spot: spotId, droppedPx: dropped, cell: { w: cw, h: chh, x: cell.x0 }, standingPx, wantPx, drawn: `${drawW}x${drawH}`, feetAt: `${Math.round(footX)}/${drawW}`, supportPx: `${supportX},${supportY}`, drawnAt: `${left},${top}`, hasContract: Boolean(contract), layer: slot.layer };
    report.push(row);
    console.log(`${boardSlug}/${spotId}: cell ${cw}x${chh} -> ${drawW}x${drawH} px, feet at ${supportX},${supportY}${contract ? "" : " (no contract: slot centre used)"}`);
  }
  writeFileSync(path.join(out, `placed-${boardSlug}.json`), JSON.stringify(report, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
