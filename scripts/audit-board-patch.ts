/** Audit an EXISTING patch on the same board layers the player sees. No DB writes.
 * npx tsx scripts/audit-board-patch.ts --scene=paris --target=awning --variant=A
 *   --patch=work/cell/patch.webp --geometry=work/cell/cell.json
 *   --reference=work/child-sheet.png --out=work/audit-unique [--execute --budget-cents=12]
 * Without --execute this is free: it writes the exact input images + plan only.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { BOARD_JUDGE_MODEL, BOARD_FAST_JUDGE_MODEL, BOARD_JUDGE_VERSION, boardJudgeReserveCents } from "../src/infra/generation/board-verdict";
import { boardComposite } from "../src/services/generation/board-composite";
import { sceneBySlug } from "../src/services/scene-catalog.service";
import { ArtRectSchema } from "../src/domain/game/config";

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
async function main() {
  const args = new Map(process.argv.slice(2).map(a => { const i=a.indexOf("=");return i<0 ? [a.replace(/^--/,""),"true"] : [a.slice(2,i),a.slice(i+1)]; }));
  const allowed=["scene","target","variant","patch","geometry","reference","out","execute","budget-cents"];
  for(const key of args.keys()) if(!allowed.includes(key)) throw new Error(`unknown argument ${key}`);
  const required=(name:string)=>{const v=args.get(name);if(!v)throw new Error(`--${name} is required`);return v;};
  const scene=sceneBySlug(required("scene"));const target=scene.targets.find(t=>t.id===required("target"));if(!target)throw new Error("unknown target");
  const variant=args.get("variant")??"A";if(variant!=="A"&&variant!=="B")throw new Error("variant must be A or B");const slot=target.slots[variant==="A"?0:1];
  const out=path.resolve(required("out"));if(existsSync(out)&&readdirSync(out).length)throw new Error("output must be empty; historical evidence is never overwritten");
  const patch=readFileSync(required("patch")),reference=readFileSync(required("reference"));const meta=JSON.parse(readFileSync(required("geometry"),"utf8"));
  const rect=ArtRectSchema.parse(meta.geometry?.rect??meta.rectNorm??meta.rect);
  if(rect.x+rect.w>1.000001||rect.y+rect.h>1.000001||rect.w<=0||rect.h<=0)throw new Error("patch rectangle must fit the board");
  const base=readFileSync(path.join("public",scene.art.base));const foreground=scene.art.foreground?readFileSync(path.join("public",scene.art.foreground)):undefined;
  const board=await boardComposite({base,foreground,art:scene.art,patch,rect,layer:slot.layer,flip:slot.flip});
  const label=`${scene.slug}/${target.id}/${variant}`;const childName="reference child";const reserve=boardJudgeReserveCents(childName);
  const codeFiles=["src/infra/generation/judge.ts","src/infra/generation/board-verdict.ts","src/services/generation/board-composite.ts"];
  const plan={version:BOARD_JUDGE_VERSION,label,commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),codeHashes:Object.fromEntries(codeFiles.map(f=>[f,sha(readFileSync(f))])),sceneHash:sha(JSON.stringify(scene)),inputHashes:{base:sha(base),foreground:foreground?sha(foreground):null,patch:sha(patch),reference:sha(reference),board:sha(board)},rect,reserveCents:reserve,models:[BOARD_FAST_JUDGE_MODEL,BOARD_JUDGE_MODEL]};
  const execute=args.get("execute")==="true";const budget=Number(args.get("budget-cents")??0);
  if(execute&&(!Number.isFinite(budget)||budget<reserve))throw new Error(`requires --budget-cents of at least ${reserve.toFixed(6)}`);
  mkdirSync(out,{recursive:true});writeFileSync(path.join(out,"board.png"),board);writeFileSync(path.join(out,"patch.webp"),patch);writeFileSync(path.join(out,"reference.png"),await sharp(reference).png().toBuffer());
  await sharp(patch).resize(512,512,{fit:"contain",background:"#828282"}).flatten({background:"#828282"}).png().toFile(path.join(out,"patch-gray.png"));
  writeFileSync(path.join(out,"plan.json"),JSON.stringify(plan,null,2));if(!execute){console.log(`Dry run: ${out}; no API call. Reserve ${reserve.toFixed(6)} cents.`);return;}
  const key=process.env.OPENAI_API_KEY??(existsSync(".env")?readFileSync(".env","utf8").match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]:undefined);if(!key)throw new Error("OPENAI_API_KEY is not configured");
  // The reservation is durable BEFORE the first request. An interrupted run is
  // pending/unknown; no append/retry can silently purchase it again.
  const manifest=path.join(out,"result.json");writeFileSync(manifest,JSON.stringify({status:"pending",reservedCents:reserve,planHash:sha(JSON.stringify(plan))},null,2));
  const result=await new OpenAiPatchJudge(key,{tries:1}).judge({patchPng:patch,reference,childName,label,boardCrop:board});
  const charged=result.costUnknown?Math.max(result.costCents,reserve):result.costCents;
  writeFileSync(manifest,JSON.stringify({status:"done",accountedCents:charged,planHash:sha(JSON.stringify(plan)),result},null,2));
  console.log(`${label}: ${result.verdict}; ${charged.toFixed(6)} cents accounted. ${out}`);
  if(result.costUnknown||charged>reserve||result.attempts?.some(a=>!plan.models.includes(a.model??"")))throw new Error("usage/model/reservation guard: inspect saved evidence before any further call");
}
main().catch(e=>{console.error(e instanceof Error?e.message:"audit failed");process.exitCode=1;});
