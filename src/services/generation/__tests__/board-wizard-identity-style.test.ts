import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { boardConditioningHash } from "../board-conditioned-source";
import { sha256Bytes } from "../fixed-sprite";

let scratch: string, count = 0;
beforeAll(async () => { scratch = await mkdtemp(path.join(await realpath(tmpdir()), "findme-static-identity-style-")); });
afterAll(async () => {
  const absolute = path.resolve(scratch);
  if (path.dirname(absolute) === await realpath(tmpdir()) && path.basename(absolute).startsWith("findme-static-identity-style-")) await rm(absolute, { recursive: true, force: true });
});
async function fixture() {
  const root = path.join(scratch, `case-${++count}`), catalogFile = path.join(root, "content/board-conditioned-qa/catalog.json");
  await mkdir(path.dirname(catalogFile), { recursive: true }); await mkdir(path.join(root, "public/static"), { recursive: true });
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#537c91" } }).png().toBuffer();
  const ref = { path: "public/static/board.png", sha256: sha256Bytes(png) };
  await writeFile(path.join(root, ref.path), png);
  const slot = (id: string) => ({ slot: { id, pose: "standing", mode: "open", eye: { x: 10, y: 10 }, faceHeightPx: 8, window: { left: 0, top: 0, width: 32, height: 32 }, supportPointPx: { x: 10, y: 30 }, standingHeightPx: 24 },
    context: { left: 0, top: 0, width: 32, height: 32 }, originalPeople: { left: 4, top: 2, width: 20, height: 28 }, poseDescription: "Natural standing pose", wardrobe: "Warm clothes",
    lighting: { key: "Diffuse sky light", fill: "Soft fill light", shadows: "Broad matte shade", exposure: "Like original people" }, foreground: ref, hintText: { he: "מחבוא", en: "Hiding spot" } });
  const catalog = { version: "board-conditioned-qa-catalog/v1", revision: "synthetic-style", worldSlug: "journey", sourcePresentation: "local-composite/v5",
    boards: Array.from({ length: 9 }, (_, i) => ({ boardId: `board-${i}`, sceneVersion: 1, board: ref, slots: [slot("one"), slot("two"), slot("three")] })) };
  await writeFile(catalogFile, JSON.stringify(catalog));
  return { root, catalogFile, catalog, png, ref, save: () => writeFile(catalogFile, JSON.stringify(catalog)) };
}
describe("mandatory child-free static original-people atlas", () => {
  it("builds deterministic1024 atlas from all nine hash-verified originals, with no input identity", async () => {
    const f = await fixture(), first = await buildBoardWizardIdentityStyle(f.root), second = await buildBoardWizardIdentityStyle(f.root);
    expect(first.version).toBe("board-matched-identity/v1"); expect(first.catalogSha256).toBe(boardConditioningHash(f.catalog));
    expect(first.atlasSha256).toBe(sha256Bytes(first.png)); expect(first.png.equals(second.png)).toBe(true);
    expect(first.examples.map(e => e.boardId)).toEqual(f.catalog.boards.map(b => b.boardId));
    expect(first.examples.every(e => e.boardSha256 === f.ref.sha256)).toBe(true);
    expect(await sharp(first.png).metadata()).toMatchObject({ format: "png", width: 1024, height: 1024 });
    expect(await readFile(path.join(f.root, f.ref.path))).toEqual(f.png); // never alters the static original
  });
  it.each(["hash", "missing", "crop", "private-root", "missing-board", "missing-foreground"])("does not fall back to generic style after %s", async reason => {
    const f = await fixture();
    if (reason === "hash") f.catalog.boards[0]!.board = { ...f.ref, sha256: "a".repeat(64) };
    if (reason === "missing") f.catalog.boards[0]!.board = { ...f.ref, path: "public/static/missing.png" };
    if (reason === "crop") f.catalog.boards[0]!.slots[0]!.originalPeople.left = 25;
    if (reason === "private-root") f.catalog.boards[0]!.board = { ...f.ref, path: "work/child.png" };
    if (reason === "missing-board") f.catalog.boards.pop();
    if (reason === "missing-foreground") f.catalog.boards[0]!.slots[0]!.foreground = { ...f.ref, path: "public/static/missing-mask.png" };
    await f.save(); await expect(buildBoardWizardIdentityStyle(f.root)).rejects.toThrow();
  });
});
