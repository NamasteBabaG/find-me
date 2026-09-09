/** Recoverable local packaging promotion. No delete, API, DB or deploy. */
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boardConditionedCatalogSchema } from "../src/services/generation/board-conditioned-catalog";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

type Options = { workspaceRoot?: string; stagedPath: string; archivePath: string; expectedCurrentSha256?: string };
const content = "content/board-conditioned-qa", active = `${content}/catalog.json`;
const assetPattern = /^content\/board-conditioned-qa\/([A-Za-z0-9_-]+)\/([a-z0-9-]+)\/(board|foreground-[1-3])\.png$/;
async function exists(file: string) { try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } }

export async function prepareCatalogPromotion(options: Options) {
  const root = await realpath(options.workspaceRoot ?? process.cwd());
  if (!/^content\/board-conditioned-qa\/catalog-[A-Za-z0-9_-]+\.json$/.test(options.stagedPath)
    || !/^work\/catalog-packaging-archive-[0-9-]+\/[a-z0-9-]+$/.test(options.archivePath)) throw new Error("Explicit staged catalog and private versioned archive paths required");
  const absolute = (file: string) => {
    const resolved = path.resolve(root, file), relative = path.relative(root, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Packaging path escaped workspace");
    return resolved;
  };
  const noSymlinks = async (file: string) => {
    const relative = path.relative(root, absolute(file)); let ancestor = root;
    for (const segment of relative.split(path.sep)) {
      ancestor = path.join(ancestor, segment);
      if (await exists(ancestor) && (await lstat(ancestor)).isSymbolicLink()) throw new Error("Packaging paths cannot traverse symlinks/junctions");
    }
  };
  await noSymlinks(options.archivePath);
  if (await exists(absolute(options.archivePath))) throw new Error("Archive must be a fresh recoverable destination");
  const inspect = async (file: string) => {
    await noSymlinks(file);
    const bytes = await readFile(absolute(file)), catalog = boardConditionedCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
    const refs = catalog.boards.flatMap(board => [board.board, ...board.slots.map(slot => slot.foreground)]);
    if (refs.length !== 36 || new Set(refs.map(r => r.path)).size !== 36 || refs.some(r => !assetPattern.test(r.path))) throw new Error("Exactly36 revision-owned static files required");
    const assets = [];
    for (const ref of refs) {
      await noSymlinks(ref.path); const image = await readFile(absolute(ref.path));
      if (sha256Bytes(image) !== ref.sha256) throw new Error(`Static image changed:${ref.path}`);
      assets.push({ path: ref.path, sha256: ref.sha256, bytes: image.length });
    }
    return { file, sha256: sha256Bytes(bytes), revision: catalog.revision, assets };
  };
  const current = await inspect(active), staged = await inspect(options.stagedPath);
  if (options.expectedCurrentSha256 && current.sha256 !== options.expectedCurrentSha256) throw new Error("Active catalog changed since approval");
  if (current.revision === staged.revision) throw new Error("New catalog must have a different immutable revision");
  const oldDirs = [...new Set(current.assets.map(a => `${content}/${a.path.split("/")[2]}`))];
  if (staged.assets.some(a => oldDirs.some(directory => a.path.startsWith(`${directory}/`)))) throw new Error("Staged assets must not reuse a directory scheduled for archive");
  for (const directory of oldDirs) {
    const declared = new Set(current.assets.filter(a => a.path.startsWith(`${directory}/`)).map(a => a.path));
    const walk = async (relative: string): Promise<string[]> => {
      await noSymlinks(relative); const found = [];
      for (const entry of await readdir(absolute(relative), { withFileTypes: true })) {
        const child = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error("Unexpected old artifact file kind");
        if (entry.isDirectory()) {
          if (![...declared].some(file => file.startsWith(`${child}/`))) throw new Error("Undeclared directory in old artifact revision");
          found.push(...await walk(child));
        } else found.push(child);
      }
      return found;
    };
    const found = await walk(directory);
    if (found.length !== declared.size || found.some(file => !declared.has(file))) throw new Error("Old asset revision contains undeclared files; refusing broad move");
  }
  return { root, archivePath: options.archivePath, current, staged, oldDirs, newBytes: staged.assets.reduce((n, a) => n + a.bytes, 0),
    archivedBytes: current.assets.reduce((n, a) => n + a.bytes, 0), destructiveDeletes: 0 };
}

export async function promoteCatalogRecoverably(options: Options) {
  if (!/^[a-f0-9]{64}$/.test(options.expectedCurrentSha256 ?? "")) throw new Error("Explicit expected active-catalog SHA required to apply");
  const plan = await prepareCatalogPromotion(options);
  const absolute = (relative: string) => path.resolve(plan.root, relative);
  await mkdir(absolute(plan.archivePath), { recursive: true });
  await writeFile(path.join(absolute(plan.archivePath), "PROMOTION_PLAN.json"), JSON.stringify(plan, null, 2), { flag: "wx" });
  const moves: { from: string; to: string }[] = [];
  const move = async (from: string, to: string) => {
    if (await exists(absolute(to))) throw new Error("Refusing to overwrite a packaging destination");
    await rename(absolute(from), absolute(to)); moves.push({ from, to });
  };
  try {
    for (const directory of plan.oldDirs) await move(directory, `${plan.archivePath}/${path.basename(directory)}`);
    await move(active, `${plan.archivePath}/catalog.json`);
    await move(options.stagedPath, active);
    await writeFile(path.join(absolute(plan.archivePath), "PROMOTION_RESULT.json"), JSON.stringify({ status: "promoted", moves, activeSha256: plan.staged.sha256 }, null, 2), { flag: "wx" });
    return { status: "promoted", archivePath: plan.archivePath, revision: plan.staged.revision, activeSha256: plan.staged.sha256,
      staticBytes: plan.newBytes, recoverableArchivedBytes: plan.archivedBytes, filesDeleted: 0 };
  } catch (error) {
    const rollbackErrors = [];
    for (const { from, to } of [...moves].reverse()) {
      try { if (await exists(absolute(from))) throw new Error("Original path was occupied during rollback"); await rename(absolute(to), absolute(from)); }
      catch (rollbackError) { rollbackErrors.push(String(rollbackError)); }
    }
    await writeFile(path.join(absolute(plan.archivePath), "PROMOTION_FAILURE.json"), JSON.stringify({ error: String(error), rollbackErrors, moves }, null, 2), { flag: "wx" });
    throw new Error(`Promotion failed; ${rollbackErrors.length ? "manual recovery required" : "all moves rolled back"}: ${String(error)}`);
  }
}

async function main() {
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const options = { stagedPath: arg("staged") ?? "", archivePath: arg("archive") ?? "", expectedCurrentSha256: arg("expected-current-sha") };
  const result = process.argv.includes("--apply") ? await promoteCatalogRecoverably(options) : await prepareCatalogPromotion(options);
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
