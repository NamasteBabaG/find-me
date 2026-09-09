/** Export only validated, child-free static art and placement contracts. No API. */
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { boardConditionedCatalogSchema, loadBoardConditionedCatalogBoard } from "../src/services/generation/board-conditioned-catalog";
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
async function main() {
  const manifestPath = arg("manifest"), revision = arg("revision");
  if (!manifestPath || !revision || !/^[a-z0-9-]+$/.test(revision)) throw new Error("--manifest and immutable --revision required");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { boards: { spec: string; hints: {he:string;en:string}[] }[] };
  if (manifest.boards.length !== 9) throw new Error("Exactly nine explicitly selected boards required");
  const boards = [];
  let bytes = 0;
  for (const entry of manifest.boards) {
    const spec = JSON.parse(await readFile(entry.spec, "utf8"));
    const inputs = await loadBoardConditioningInputs(spec);
    if (inputs.length !== 1 || inputs[0]!.sourcePresentation !== "local-composite/v5" || entry.hints.length !== 3) throw new Error("One v5 board and three hints per entry required");
    const input = inputs[0]!;
    const assetRevision=arg("asset-revision")??revision;
    if(!/^[a-z0-9-]+$/.test(assetRevision))throw new Error("Safe static asset revision required");
    const base = `content/board-conditioned-qa/${assetRevision}/${input.boardId}`;
    await mkdir(base, { recursive: true });
    // Lossless packaging, not restyling: omit redundant opaque alpha and the
    // invisible RGB behind alpha=0 in full-board foreground masks.
    const packedBoard = await sharp(input.board.png).removeAlpha().png({compressionLevel:9}).toBuffer();
    writeImmutableBytes(`${base}/board.png`, packedBoard); bytes += packedBoard.length;
    const scene = JSON.parse(await readFile(`content/scenes/${input.boardId}/scene.json`, "utf8"));
    const slots = await Promise.all(input.slots.map(async ({foreground, ...direction}, i) => {
      const file = `${base}/foreground-${i + 1}.png`;
      const {data,info} = await sharp(foreground.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      for(let p=0;p<data.length;p+=4)if(data[p+3]===0)data[p]=data[p+1]=data[p+2]=0;
      const packed=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png({compressionLevel:9}).toBuffer();
      writeImmutableBytes(file, packed); bytes += packed.length;
      return {...direction, foreground: {path:file, sha256:sha256Bytes(packed)}, hintText:entry.hints[i]};
    }));
    boards.push({boardId:input.boardId, sceneVersion:scene.version, board:{path:`${base}/board.png`,sha256:sha256Bytes(packedBoard)},slots});
  }
  const catalog = boardConditionedCatalogSchema.parse({version:"board-conditioned-qa-catalog/v1",revision,worldSlug:"journey",sourcePresentation:"local-composite/v5",boards});
  const target = arg("output") ?? "content/board-conditioned-qa/catalog.json";
  if (!path.resolve(target).startsWith(path.resolve("content/board-conditioned-qa") + path.sep)) throw new Error("Catalog output must remain in child-free content directory");
  await mkdir(path.dirname(target), {recursive:true});
  writeImmutableBytes(target, JSON.stringify(catalog,null,2));
  // Independent runtime loader must accept exactly the exported files.
  const dummyChild = (await loadBoardConditioningInputs(JSON.parse(await readFile(manifest.boards[0]!.spec,"utf8"))))[0]!.child;
  for (const b of boards) await loadBoardConditionedCatalogBoard(catalog,b.boardId,dummyChild);
  console.log(JSON.stringify({target,revision,boards:boards.length,slots:boards.reduce((n,b)=>n+b.slots.length,0),staticBytes:bytes,childImagesExported:0}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
