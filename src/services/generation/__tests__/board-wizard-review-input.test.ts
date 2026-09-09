import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { BoardConditioningInput } from "../board-conditioned-source";
import type { prepareBoardConditionedPlayerBoard } from "../board-conditioned-player";
import { prepareBoardWizardReviews } from "../board-wizard-review-input";
import { normalizeBoardWizardIdentity } from "../board-wizard-identity";
import { sha256Bytes } from "../fixed-sprite";

const solid = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
describe("free final-player review input and identity normalization", () => {
  it("judges exact already-graded player pixels in the board and names an existing foreground layer correctly", async () => {
    const board = await solid(100, 100, "#eeeeee"), patch = await solid(10, 20, "#445566"), transparent = await solid(100, 100, "#00000000");
    const mask = await sharp(transparent).composite([{ input: await solid(5, 5, "#112233"), left: 1, top: 1 }]).png().toBuffer();
    const rect = { left: 10, top: 10, width: 80, height: 80 };
    const input = { boardId: "fixture", board: { png: board, sha256: sha256Bytes(board) }, slots: [{ slot: { id: "A", pose: "standing", mode: "open" }, context: rect, originalPeople: rect,
      poseDescription: "Standing naturally in shade", lighting: { key: "Soft sky", fill: "Cool pavement", shadows: "Shared shade", exposure: "Moderate chroma" }, foreground: { png: mask, sha256: sha256Bytes(mask) } }] } as unknown as BoardConditioningInput;
    const player = { manifest: { width: 100, height: 100, placements: [{ slotId: "A", assetKey: "final", boardPixelRect: { left: 45, top: 40, width: 10, height: 20 } }] }, assetWrites: [{ key: "final", png: patch }] } as unknown as Awaited<ReturnType<typeof prepareBoardConditionedPlayerBoard>>;
    const [review] = await prepareBoardWizardReviews("fixture", 1, input, player);
    expect(review!.recipe.occlusionMode).toBe("layer"); expect(review!.recipe.support).toContain("saturation");
    const pixel = await sharp(review!.context).extract({ left: 47, top: 44, width: 1, height: 1 }).raw().toBuffer();
    expect([...pixel.slice(0, 3)]).toEqual([68, 85, 102]); expect(review!.patchSha256).toBe(sha256Bytes(patch));
    input.slots[0]!.foreground = { png: transparent, sha256: sha256Bytes(transparent) };
    expect((await prepareBoardWizardReviews("fixture", 1, input, player))[0]!.recipe.occlusionMode).toBe("open");
  });
  it("extracts the canonical portrait automatically, never leaks three other pose cells, and binds original bytes", async () => {
    const sheet = await sharp(await solid(200, 200, "#00ff00")).composite([{ input: await solid(100, 100, "#445566"), left: 0, top: 0 }]).png().toBuffer();
    const a = await normalizeBoardWizardIdentity(sheet), b = await normalizeBoardWizardIdentity(sheet);
    expect(a.sha256).toBe(b.sha256); expect(a.sourceSha256).toBe(sha256Bytes(sheet));
    const { data, info } = await sharp(a.png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([512, 512]);
    const center = (256 * 512 + 256) * 4; expect([...data.slice(center, center + 3)]).toEqual([68, 85, 102]);
    expect([...data.slice(0, 3)]).toEqual([128, 128, 128]);
    await expect(normalizeBoardWizardIdentity(await solid(100, 80, "#445566"))).rejects.toThrow("canonical square");
  });
});
