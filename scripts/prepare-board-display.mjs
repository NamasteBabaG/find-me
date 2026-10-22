import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

// Offline public artwork only. No provider, DB or GameConfig writes.
// --write explicitly prepares derivatives; the default only verifies bindings.
const write = process.argv.includes("--write");
const manifestPath = "content/board-display-art.json";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const masters = (await Promise.all(["wizard-refresh-art.json", "wizard-kingdom-art.json"].map(name => readFile(`content/adventures/${name}`, "utf8").then(JSON.parse)))).flat();
const existing = JSON.parse(await readFile(manifestPath, "utf8"));
const prepared = [];
sharp.cache(false); sharp.concurrency(2);
for (const master of masters) {
  const source = await readFile(master.path);
  if (sha(source) !== master.sha256) throw Error(`Canonical source drift: ${master.path}`);
  const metadata = await sharp(source).metadata();
  if (metadata.format !== "webp" || metadata.hasAlpha || metadata.width !== 3840 || metadata.height !== 2160) throw Error(`Unexpected board raster: ${master.path}`);
  const sourceUrl = master.path.replace(/^public/, "");
  let entry = existing.find(row => row.source === sourceUrl && row.sourceSha256 === master.sha256);
  if (write) {
    const pixels = await sharp(source).removeAlpha().raw().toBuffer();
    const output = await sharp(source).webp({ nearLossless: true, quality: 60, effort: 6 }).toBuffer();
    const decoded = await sharp(output).removeAlpha().raw().toBuffer();
    if (pixels.length !== decoded.length) throw Error("Display dimensions changed");
    let maxChannelError = 0;
    for (let i = 0; i < pixels.length; i++) maxChannelError = Math.max(maxChannelError, Math.abs(pixels[i] - decoded[i]));
    if (maxChannelError > 2 || output.length >= source.length) throw Error(`Display pixel/size budget exceeded: ${master.path}`);
    const displaySha256 = sha(output);
    const display = `${path.posix.dirname(sourceUrl)}/display-near60-${displaySha256.slice(0, 16)}.webp`;
    entry = { source: sourceUrl, sourceSha256: master.sha256, width: metadata.width, height: metadata.height, recipe: "webp-near60/v1", display, displaySha256, sourceBytes: source.length, displayBytes: output.length, maxChannelError };
    await mkdir(path.dirname(`public${display}`), { recursive: true });
    await writeFile(`public${display}`, output);
  }
  if (!entry || entry.recipe !== "webp-near60/v1" || entry.sourceBytes !== source.length || entry.maxChannelError > 2) throw Error(`Missing/invalid bound display: ${master.path}`);
  const delivered = await readFile(`public${entry.display}`);
  const displayMeta = await sharp(delivered).metadata();
  if (sha(delivered) !== entry.displaySha256 || delivered.length !== entry.displayBytes || delivered.length >= source.length || displayMeta.width !== metadata.width || displayMeta.height !== metadata.height || displayMeta.format !== "webp" || displayMeta.hasAlpha) throw Error(`Display artifact drift: ${master.path}`);
  prepared.push(entry);
  console.log(JSON.stringify({ source: sourceUrl, sourceBytes: source.length, displayBytes: entry.displayBytes, maxChannelError: entry.maxChannelError }));
}
if (write) await writeFile(manifestPath, JSON.stringify(prepared, null, 2) + "\n");
else if (existing.length !== prepared.length) throw Error("Unbound display entry");
console.log(JSON.stringify({ verified: prepared.length, sourceBytes: prepared.reduce((n,e) => n+e.sourceBytes,0), displayBytes: prepared.reduce((n,e) => n+e.displayBytes,0), canonicalWrites: 0 }));
