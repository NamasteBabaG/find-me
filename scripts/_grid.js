// Renders a world with a 10% coordinate grid for slot placement: node scripts/_grid.js <slug> <outPng>
const sharp = require("sharp"); const path = require("path");
(async () => {
  const [slug, out] = process.argv.slice(2);
  const src = path.join("public", "scenes", slug, "base.webp");
  const m = await sharp(src).metadata(); const W = m.width, H = m.height;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (let i = 1; i < 10; i++) { const x = Math.round(W * i / 10), y = Math.round(H * i / 10);
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(255,0,0,0.55)" stroke-width="2"/><text x="${x + 4}" y="22" font-size="22" font-weight="bold" fill="#ff0000">${i / 10}</text>`;
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,0,0,0.55)" stroke-width="2"/><text x="4" y="${y - 6}" font-size="22" font-weight="bold" fill="#ff0000">${i / 10}</text>`; }
  svg += `</svg>`;
  const full = await sharp(src).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
  await sharp(full).resize({ width: 1400 }).png().toFile(out);
  console.log("grid", slug, W, H);
})();
