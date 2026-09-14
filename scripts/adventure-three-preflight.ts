/** Free, deterministic review material. No provider, credentials or game writes. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { THREE_PATCH_BOARDS, ADVENTURE_THREE_BOARDS } from "../content/adventures/three-boards";
import { cropOf, maskForHide } from "../src/domain/scene/local-patch-hides";

async function main() {
  const dir = path.resolve("storage/adventure-three-preflight"); mkdirSync(dir, { recursive: true });
  for (const [index, board] of THREE_PATCH_BOARDS.entries()) {
    const source = readFileSync(board.art), plan = ADVENTURE_THREE_BOARDS.boards[index]!;
    if (plan.status !== "ready") throw new Error("Art is not ready");
    const crops = await Promise.all(board.hides.map(async hide => {
      const mask = maskForHide(hide);
      const overlay = Buffer.from(`<svg width="512" height="768"><rect x="${mask.left}" y="${mask.top}" width="${mask.width}" height="${mask.height}" fill="none" stroke="#ff00ff" stroke-width="3"/><text x="12" y="26" fill="#ff00ff" font-size="22">${hide.targetId}</text></svg>`);
      return sharp(source).extract(cropOf(hide)).composite([{input:overlay}]).png().toBuffer();
    }));
    await sharp({create:{width:1536,height:768,channels:4,background:"#ddd"}}).composite(crops.map((input,i)=>({input,left:i*512,top:0}))).png().toFile(path.join(dir,`${board.board}-hides.png`));
    const cards = await Promise.all(plan.discoveries.map(async item => {
      const r=item.cardCrop;
      return sharp(source).extract({left:Math.floor(r.x*3840),top:Math.floor(r.y*2160),width:Math.floor(r.w*3840),height:Math.floor(r.h*2160)}).resize(240,200,{fit:"contain",background:"#eee"}).png().toBuffer();
    }));
    await sharp({create:{width:1440,height:200,channels:4,background:"#eee"}}).composite(cards.map((input,i)=>({input,left:i*240,top:0}))).png().toFile(path.join(dir,`${board.board}-discoveries.png`));
  }
  writeFileSync(path.join(dir,"manifest.json"),JSON.stringify({boards:THREE_PATCH_BOARDS,art:ADVENTURE_THREE_BOARDS},null,2));
  console.log(JSON.stringify({paidCalls:0,dir,boards:3,hides:9,discoveries:18}));
}
main().catch(()=>{console.error("Preflight failed; inspect source assets/catalog");process.exitCode=1;});
