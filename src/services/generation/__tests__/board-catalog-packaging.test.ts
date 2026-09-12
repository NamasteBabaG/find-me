import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, access, rm, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { prepareCatalogPromotion, promoteCatalogRecoverably } from "../../../../scripts/promote-board-conditioned-catalog";
import { sha256Bytes } from "../fixed-sprite";

const project = process.cwd(), temporary: string[] = [];
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    const actual = await realpath(directory), relative = path.relative(await realpath(tmpdir()), actual);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !relative.startsWith("findme-packaging-test-")) throw new Error("Unsafe test cleanup target");
    await rm(actual, { recursive: true });
  }
});
const present = async (file: string) => { try { await access(file); return true; } catch { return false; } };

/**
 * These two are integration tests, not unit tests: between them they create and
 * move around two hundred real files and spawn two Node processes. The suite's
 * 20s default is sized for tests that touch no disk, and under the full run -
 * where a dozen workers compete for the same disk - this file reliably ran out
 * of it while finishing in a third of a second on its own. Declaring what the
 * tests actually are is the fix; shortening what they do would be a different
 * change, and they are testing file movement.
 */
const IO_TIMEOUT_MS = 90_000;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "findme-packaging-test-")); temporary.push(root);
  await mkdir(path.join(root, "work"));
  const makeCatalog = async (revision: string, file: string) => {
    const boards = [];
    for (let i = 0; i < 9; i++) {
      const boardId = `board-${i}`, base = `content/board-conditioned-qa/${revision}/${boardId}`;
      await mkdir(path.join(root, base), { recursive: true });
      const image = async (name: string) => {
        const colour = sha256Bytes(Buffer.from(`${revision}/${boardId}/${name}`));
        const bytes = await sharp({ create: { width: 1, height: 1, channels: 3,
          background: { r: parseInt(colour.slice(0, 2), 16), g: parseInt(colour.slice(2, 4), 16), b: parseInt(colour.slice(4, 6), 16) } } }).png().toBuffer();
        const imagePath = `${base}/${name}.png`; await writeFile(path.join(root, imagePath), bytes);
        return { path: imagePath, sha256: sha256Bytes(bytes) };
      };
      const slots = [];
      for (let n = 1; n <= 3; n++) slots.push({ slot: { id: `slot-${n}`, pose: "standing", mode: "open", eye: { x: 40, y: 40 }, faceHeightPx: 20,
        window: { left: 0, top: 0, width: 100, height: 120 }, supportPointPx: { x: 40, y: 100 }, standingHeightPx: 70 },
        context: { left: 0, top: 0, width: 100, height: 120 }, originalPeople: { left: 1, top: 1, width: 20, height: 30 },
        poseDescription: "Natural standing pose", wardrobe: "Warm winter clothes", lighting: { key: "Diffuse sky light", fill: "Snow bounce light", shadows: "Blue snowy planes", exposure: "Same as nearby people" },
        foreground: await image(`foreground-${n}`), hintText: { he: "בחנות", en: "In the shop" } });
      boards.push({ boardId, sceneVersion: 1, board: await image("board"), slots });
    }
    const catalog = { version: "board-conditioned-qa-catalog/v1", revision, worldSlug: "journey", sourcePresentation: "local-composite/v5", boards };
    const bytes = Buffer.from(JSON.stringify(catalog)); await writeFile(path.join(root, file), bytes);
    return { catalog, bytes, sha256: sha256Bytes(bytes) };
  };
  const current = await makeCatalog("old-v2", "content/board-conditioned-qa/catalog.json");
  const staged = await makeCatalog("new-v4", "content/board-conditioned-qa/catalog-v4.json");
  return { root, current, staged, options: { workspaceRoot: root, stagedPath: "content/board-conditioned-qa/catalog-v4.json",
    archivePath: "work/catalog-packaging-archive-20260909/pre-v4", expectedCurrentSha256: current.sha256 } };
}

describe("recoverable child-free catalog packaging", () => {
  it("plans without moving files, then promotes36newassets and archives every old file without deletion", async () => {
    const f = await fixture(), plan = await prepareCatalogPromotion(f.options);
    expect(plan.current.assets).toHaveLength(36); expect(plan.staged.assets).toHaveLength(36);
    expect(await present(path.join(f.root, f.options.archivePath))).toBe(false);
    const result = await promoteCatalogRecoverably(f.options); expect(result.filesDeleted).toBe(0);
    expect(await readFile(path.join(f.root, "content/board-conditioned-qa/catalog.json"))).toEqual(f.staged.bytes);
    expect(await readFile(path.join(f.root, f.options.archivePath, "catalog.json"))).toEqual(f.current.bytes);
    expect(await present(path.join(f.root, "content/board-conditioned-qa/old-v2"))).toBe(false);
    for (const asset of plan.current.assets) expect(sha256Bytes(await readFile(path.join(f.root, f.options.archivePath, asset.path.replace("content/board-conditioned-qa/", ""))))).toBe(asset.sha256);
    expect(await present(path.join(f.root, f.options.archivePath, "PROMOTION_RESULT.json"))).toBe(true);
  }, IO_TIMEOUT_MS);
  it.each(["stale-approval", "modified-asset", "undeclared-file", "unsafe-archive", "already-used-archive", "shared-revision-directory"])("refuses%s without moving the active catalog", async defect => {
    const f = await fixture();
    if (defect === "stale-approval") f.options.expectedCurrentSha256 = "a".repeat(64);
    if (defect === "modified-asset") await writeFile(path.join(f.root, f.staged.catalog.boards[0]!.board.path), "changed");
    if (defect === "undeclared-file") await writeFile(path.join(f.root, "content/board-conditioned-qa/old-v2/keep-user-file.txt"), "not mine");
    if (defect === "unsafe-archive") f.options.archivePath = "../outside";
    if (defect === "already-used-archive") await mkdir(path.join(f.root, f.options.archivePath), { recursive: true });
    if (defect === "shared-revision-directory") {
      f.staged.catalog.boards[0]!.board = f.current.catalog.boards[0]!.board;
      await writeFile(path.join(f.root, f.options.stagedPath), JSON.stringify(f.staged.catalog));
    }
    await expect(promoteCatalogRecoverably(f.options)).rejects.toThrow();
    expect(await readFile(path.join(f.root, "content/board-conditioned-qa/catalog.json"))).toEqual(f.current.bytes);
    expect(await present(path.join(f.root, "content/board-conditioned-qa/old-v2"))).toBe(true);
  });
});

describe("active-catalog-only server traces", () => {
  it("audit rejects a stale asset revision; filter removes it plusprivate paths without touching files", async () => {
    const f = await fixture();
    await promoteCatalogRecoverably(f.options);
    await writeFile(path.join(f.root, "next.config.ts"), "synthetic next configuration");
    const entry = path.join(f.root, ".next/server/app/api/jobs/tick/route.js");
    await mkdir(path.dirname(entry), { recursive: true }); await writeFile(entry, "export{};");
    const assets = f.staged.catalog.boards.flatMap(board => [board.board.path, ...board.slots.map(slot => slot.foreground.path)]);
    const stale = "content/board-conditioned-qa/stale-v1/board-0/board.png";
    await mkdir(path.dirname(path.join(f.root, stale)), { recursive: true }); await writeFile(path.join(f.root, stale), "unused old bytes");
    const privateFile = `${f.options.archivePath}/catalog.json`;
    const localPatchBoards: { board: string; base: string; sha256: string }[] = [];
    const renderSources: { board: string; path: string; sha256: string; pixelsSha256: string }[] = [];
    for (const board of ["sydney", "antarctica", "giza", "tokyo", "amazon", "greatwall", "marrakech", "newyork", "paris"]) {
      const base = `/scenes/${board}/local-patch-20260912/base.webp`;
      const source = f.staged.catalog.boards[localPatchBoards.length]!.board;
      const sourceBytes = await readFile(path.join(f.root, source.path));
      const bytes = await sharp(sourceBytes).webp({ lossless: true }).toBuffer();
      await mkdir(path.dirname(path.join(f.root, "public", base)), { recursive: true });
      await writeFile(path.join(f.root, "public", base), bytes);
      localPatchBoards.push({ board, base, sha256: sha256Bytes(bytes) });
      renderSources.push({ board, ...source, pixelsSha256: sha256Bytes(await sharp(sourceBytes).ensureAlpha().raw().toBuffer()) });
    }
    const localPatchManifest = "content/local-patch-world/art.json";
    await mkdir(path.dirname(path.join(f.root, localPatchManifest)), { recursive: true });
    await writeFile(path.join(f.root, localPatchManifest), JSON.stringify({ boards: localPatchBoards, renderSources }));
    const undeclaredPublic = "public/scenes/sydney/old-thumbnail.webp";
    await writeFile(path.join(f.root, undeclaredPublic), "not a declared painter input");
    const tracePaths = ["content/board-conditioned-qa/catalog.json", ...assets, stale, privateFile,
      localPatchManifest, ...localPatchBoards.map(board => `public${board.base}`), undeclaredPublic];
    await writeFile(`${entry}.nft.json`, JSON.stringify({ version: 1, files: tracePaths.map(file => path.relative(path.dirname(entry), path.join(f.root, file))) }));
    const run = (script: string) => spawnSync(process.execPath, [path.join(project, "scripts", script)], { cwd: f.root, encoding: "utf8", windowsHide: true });
    const before = run("audit-board-catalog-tracing.mjs"); expect(before.status).toBe(1);
    expect(before.stdout).toContain("inactive board catalog revision");
    expect(run("finalize-build-traces.mjs").status).toBe(0);
    const after = run("audit-board-catalog-tracing.mjs"); expect(after.status).toBe(0);
    const result = JSON.parse(after.stdout); expect(result.jobs.catalogFiles).toBe(37); expect(result.jobs.staleCatalogFiles).toEqual([]); expect(result.jobs.privateFiles).toEqual([]);
    expect(result.jobs.localPatchFiles).toBe(10);
    expect(result.jobs.publicCdnFiles).toBe(0);
    expect(await present(path.join(f.root, stale))).toBe(true); expect(await present(path.join(f.root, privateFile))).toBe(true);
    expect(run("finalize-build-traces.mjs").stdout).toContain('"changed":0');
  }, IO_TIMEOUT_MS);
});
