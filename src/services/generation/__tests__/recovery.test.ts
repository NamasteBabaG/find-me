import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenAiAvatarProvider } from "@/infra/generation/openai";
import { renderEvidenceIds, removeRenderEvidence } from "../render-evidence";
import { GenerationBudget } from "../../../../scripts/generation-budget";
import { extractChild } from "../extract";

describe("recovery boundaries", () => {
  it("keeps a billed response when local keying fails", async () => {
    const blue = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#6699cc" } }).png().toBuffer();
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: blue.toString("base64") }], usage: { input_tokens: 2278, output_tokens: 196, input_tokens_details: { text_tokens: 230, image_tokens: 2048 } } }), { status: 200, headers: { "x-request-id": "req_mock" } }));
    try {
      const answer = await new OpenAiAvatarProvider("test", { model: "gpt-image-2", tries: 1 }).matteSlotCrop({ edited: blue, original: blue, hint: "", label: "test" });
      expect(answer.problem).toMatch(/magenta key/);
      expect(answer.rawPng).toEqual(blue);
      expect(answer.costCents).toBeCloseTo(2.341, 3);
      expect(answer.providerRequestId).toBe("req_mock");
      expect(answer.usage?.outputTokens).toBe(196);
    } finally { mock.mockRestore(); }
  });

  it("deletes every matte id without deleting the monetary audit trail", () => {
    const json = JSON.stringify({ ledger: { exactCents: 7, attempts: [{ evidenceAssetId: "a", matteEvidenceAssetId: "c", matteEvidenceAssetIds: ["b", "c"] }] } });
    expect(renderEvidenceIds(json).sort()).toEqual(["a", "b", "c"]);
    const next = removeRenderEvidence(json, new Set(["a", "b", "c"]))!;
    expect(renderEvidenceIds(next)).toEqual([]);
    expect(JSON.parse(next).ledger.exactCents).toBe(7);
  });

  it("persists each paid matte before an error from a subsequent call", async () => {
    const original = await sharp({ create: { width: 384, height: 384, channels: 3, background: "#123456" } }).png().toBuffer();
    const edited = await sharp({ create: { width: 384, height: 384, channels: 3, background: "#fedcba" } }).png().toBuffer();
    const paid: number[] = [];
    const matteSlotCrop = vi.fn().mockResolvedValueOnce({ png: Buffer.alloc(0), rawPng: edited, costCents: 2, model: "mock", problem: "wrong key", durationMs: 0, attempts: 1 }).mockImplementationOnce(() => { expect(paid).toEqual([2]); throw new Error("timed out"); });
    await expect(extractChild({ provider: { matteSlotCrop }, originalCrop: original, editedCrop: edited, art: { width: 384, height: 384 }, ctx: { rect: { x: 0, y: 0, w: 384, h: 384 }, childPx: 100, windowFactor: 4 }, slot: { x: 0.5, y: 0.5, scale: 100 / 384 }, hint: "", label: "t", onMatte: async m => { paid.push(m.costCents); } })).rejects.toThrow(/timed out/);
    expect(paid).toEqual([2]);
  });

  it("reserves durably and blocks overspend and unresolved retries", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "findme-budget-"));
    try {
      const budget = new GenerationBudget(dir, 10, { test: true });
      await budget.run("first", 6, async () => {
        expect(JSON.parse(readFileSync(path.join(dir, "requests.json"), "utf8")).entries[0].state).toBe("pending");
        return { costCents: 4.107 };
      });
      const never = vi.fn();
      await expect(budget.run("too big", 6, never)).rejects.toThrow(/insufficient/);
      expect(never).not.toHaveBeenCalled();
      await expect(budget.run("timeout", 5, async () => { throw new Error("timeout"); })).rejects.toThrow(/timeout/);
      const resumed = new GenerationBudget(dir, 10, { test: true });
      expect(resumed.spent).toBeCloseTo(9.107);
      await expect(resumed.run("again", 0.1, never)).rejects.toThrow(/unresolved/);
    } finally { rmSync(dir, { recursive: true }); }
  });
});
