/**
 * Cuts the "game ready" mail pictures from child-free board art:
 *   npx tsx scripts/email-heroes.ts
 * One 1040x520 JPEG per entry of READY_MAIL_HEROES (shown at 520x260), written
 * to public/email/. JPEG because Outlook and older mail apps do not show WebP.
 * Reads only the authored board art; no photo, no provider, no database.
 */
import path from "node:path";
import sharp from "sharp";
import { READY_MAIL_HEROES } from "../src/services/email/ready-hero";

async function main() {
  for (const [art, hero] of Object.entries(READY_MAIL_HEROES)) {
    const out = path.join("public", hero);
    const info = await sharp(path.join("public", art))
      .resize(1040, 520, { fit: "cover", position: "centre" })
      .jpeg({ quality: 74, progressive: true, mozjpeg: true })
      .toFile(out);
    console.log(`${out} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
