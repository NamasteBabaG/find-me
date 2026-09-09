import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { boardSlotDirectionSchema, boardConditioningHash, type BoardConditioningInput } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";

const png = z.object({ path: z.string().regex(/^(public|content)\/[A-Za-z0-9_./-]+\.png$/).refine(s => !s.split("/").includes("..")), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const text = z.object({ he: z.string().trim().min(1).max(250), en: z.string().trim().min(1).max(250) }).strict();
export const boardConditionedCatalogSchema = z.object({
  version: z.literal("board-conditioned-qa-catalog/v1"), revision: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), worldSlug: z.string().regex(/^[a-z0-9-]+$/),
  sourcePresentation: z.enum(["local-composite/v4", "local-composite/v5"]),
  boards: z.array(z.object({ boardId: z.string().regex(/^[a-z0-9-]+$/), sceneVersion: z.number().int().positive(), board: png,
    slots: z.array(boardSlotDirectionSchema.extend({ foreground: png, hintText: text }).strict()).length(3),
  }).strict()).length(9),
}).strict().superRefine((c, ctx) => {
  if (new Set(c.boards.map(b => b.boardId)).size !== 9 || c.boards.some(b => new Set(b.slots.map(s => s.slot.id)).size !== 3)) ctx.addIssue({ code: "custom", message: "Exactly nine unique boards with three distinct slots required" });
});
export type BoardConditionedCatalog = z.infer<typeof boardConditionedCatalogSchema>;
/** No child data or network paths are accepted in this deployment-owned artifact. */
export async function readBoardConditionedCatalog(root = process.cwd()) {
  const catalog = boardConditionedCatalogSchema.parse(JSON.parse(await readFile(path.join(root, "content/board-conditioned-qa/catalog.json"), "utf8")));
  return { catalog, sha256: boardConditioningHash(catalog) };
}
export async function loadBoardConditionedCatalogBoard(catalog: BoardConditionedCatalog, boardId: string, child: BoardConditioningInput["child"], root = process.cwd()): Promise<BoardConditioningInput> {
  const item = catalog.boards.find(b => b.boardId === boardId);
  if (!item) throw new Error("QA_CATALOG: board is outside the frozen catalog");
  const resolvedRoot = await realpath(root);
  async function load(ref: z.infer<typeof png>) {
    const absolute = await realpath(path.join(root, ref.path));
    const relative = path.relative(resolvedRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !/^(public|content)[\\/]/.test(relative)) throw new Error("QA_CATALOG: asset escaped the child-free application asset roots");
    const bytes = await readFile(absolute);
    if (bytes.length > 32 * 1024 * 1024 || sha256Bytes(bytes) !== ref.sha256) throw new Error("QA_CATALOG: static PNG changed since authoring");
    return { png: bytes, sha256: ref.sha256 };
  }
  return { boardId, sourcePresentation: catalog.sourcePresentation, board: await load(item.board), child,
    slots: await Promise.all(item.slots.map(async ({ foreground, hintText: _hint, ...direction }) => ({ ...direction, foreground: await load(foreground) }))),
  };
}
