import { describe, it, expect } from "vitest";
import { boardConditionedCatalogSchema } from "../board-conditioned-catalog";

const ref = { path: "public/board-conditioned/rev/board/mask.png", sha256: "a".repeat(64) };
const slot = (id: string) => ({ slot: { id, pose: "standing", mode: "open", eye: { x: 40, y: 40 }, faceHeightPx: 20, window: { left: 0, top: 0, width: 100, height: 120 }, supportPointPx: { x: 40, y: 100 }, standingHeightPx: 70 }, context: { left: 0, top: 0, width: 100, height: 120 }, originalPeople: { left: 1, top: 1, width: 20, height: 30 }, poseDescription: `Natural pose ${id}`, wardrobe: "Warm winter clothes", lighting: { key: "Diffuse sky light", fill: "Snow bounce light", shadows: "Blue snowy planes", exposure: "Same as nearby people" }, foreground: ref, hintText: { he: "בחנות", en: "In the shop" } });
const catalog = () => ({ version: "board-conditioned-qa-catalog/v1", revision: "v1", worldSlug: "journey", sourcePresentation: "local-composite/v5", boards: Array.from({ length: 9 }, (_, i) => ({ boardId: `board-${i}`, sceneVersion: 1, board: ref, slots: [slot("a"), slot("b"), slot("c")] })) });
describe("deployable child-free board catalog", () => {
  it("accepts exactly9 boards and three authored slots each", () => expect(boardConditionedCatalogSchema.parse(catalog()).boards).toHaveLength(9));
  it("rejects child references, extra slots and duplicate boards", () => {
    expect(boardConditionedCatalogSchema.safeParse({ ...catalog(), child: { photo: "private.png" } }).success).toBe(false);
    const c = catalog(); c.boards[0]!.slots.push(slot("d")); expect(boardConditionedCatalogSchema.safeParse(c).success).toBe(false);
    const d = catalog(); d.boards[1]!.boardId = d.boards[0]!.boardId; expect(boardConditionedCatalogSchema.safeParse(d).success).toBe(false);
  });
  it.each(["../../secret.png", "work/child.png", "public/../private/child.png", "https://example.com/image.png"])("refuses unsafe asset path %s", path => {
    const c = catalog(); c.boards[0]!.board = { ...ref, path }; expect(boardConditionedCatalogSchema.safeParse(c).success).toBe(false);
  });
});
