import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { characterPrompt, CHARACTER_PROMPT_VERSION, QA_CHARACTER_PROMPT_VERSION } from "../character-prompt";
import { OpenAiAvatarProvider, prepareCharacterPhoto } from "../openai";
import type { CharacterInput } from "../types";

let atlas: Buffer;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
beforeAll(async () => { atlas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#938679" } }).png().toBuffer(); });
afterEach(() => vi.unstubAllGlobals());
const qaInput = (): CharacterInput => ({ originalPhoto: atlas, crop: null, mimeType: "image/png", childName: "Synthetic", ageYears: 6,
  styleRef: atlas, qaStyleContract: { version: "board-matched-identity/v1", catalogSha256: "a".repeat(64), atlasSha256: sha(atlas) } });

describe("explicit board-matched QA identity contract (synthetic only)", () => {
  it("does not retry a lost identity dispatch even when the legacy provider allows three attempts", async () => {
    const fetcher = vi.fn(async () => { throw new Error("synthetic disconnected wire"); });
    vi.stubGlobal("fetch", fetcher);
    await expect(new OpenAiAvatarProvider("synthetic-never-live", { tries: 3 }).createCharacter(qaInput())).rejects.toThrow("disconnected wire");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([{ model: "gpt-image-1", quality: "medium" }, { model: "gpt-image-2", quality: "low" }])("refuses a different identity model/quality before dispatch: %j", async options => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(new OpenAiAvatarProvider("synthetic-never-live", options).createCharacter(qaInput())).rejects.toThrow("GPT Image 2 MEDIUM");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains legacy version and prompt choices without opting in", () => {
    expect(CHARACTER_PROMPT_VERSION).toBe("character-v2-child-age-detailed");
    expect(QA_CHARACTER_PROMPT_VERSION).not.toBe(CHARACTER_PROMPT_VERSION);
    expect(characterPrompt({ styled: false })).toContain("warm, detailed illustrated storybook style");
    expect(characterPrompt({ styled: true })).toContain("Image 2 is a piece of the game board");
    expect(characterPrompt({ styled: true })).not.toContain("mandatory atlas");
  });
  it("requires the atlas and preserves actual identity, age and2×2 while forbidding photographic surfaces", () => {
    expect(() => characterPrompt({ styled: false, qaStyleContractVersion: "board-matched-identity/v1" })).toThrow("requires");
    const p = characterPrompt({ styled: true, ageYears: 6, qaStyleContractVersion: "board-matched-identity/v1" });
    for (const wording of ["mandatory atlas", "6 years old", "2 by 2", "Top-left", "Bottom-right", "ink outlines", "broad matte", "no pores", "micro-hair", "skin tone", "hairline", "Do not lighten skin", "neutral diffuse matte lighting", "Later per-board rendering", "Do not infer gender from the name"]) expect(p).toContain(wording);
    expect(p).not.toContain("softly modelled cheeks");
  });
  it.each(["missing", "hash", "version", "catalog", "dimensions"])("refuses invalid mandatory style reference before HTTP (%s)", async reason => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const input = qaInput();
    if (reason === "missing") delete input.styleRef;
    if (reason === "hash") input.qaStyleContract!.atlasSha256 = "f".repeat(64);
    if (reason === "version") Object.assign(input.qaStyleContract!, { version: "unknown-style" });
    if (reason === "catalog") input.qaStyleContract!.catalogSha256 = "unverified";
    if (reason === "dimensions") { input.styleRef = await sharp(atlas).resize(32, 32).png().toBuffer(); input.qaStyleContract!.atlasSha256 = sha(input.styleRef); }
    const provider = new OpenAiAvatarProvider("synthetic-never-live", { tries: 1 });
    await expect(provider.createCharacter(input)).rejects.toThrow("CHARACTER_STYLE"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends the verified atlas unchanged with the QA prompt, while retaining MEDIUM and the2×2 request", async () => {
    const input = qaInput();
    const colors = Buffer.alloc(256 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) colors.set(x < 128 ? [200, 30, 20, 255] : [20, 60, 200, 255], (y * 256 + x) * 4);
    input.originalPhoto = await sharp(colors, { raw: { width: 256, height: 128, channels: 4 } }).png().toBuffer();
    input.crop = { x: .5, y: 0, w: .5, h: 1 };
    const selectedPhoto = await prepareCharacterPhoto(input.originalPhoto, input.crop);
    const selectedPixels = await sharp(selectedPhoto).raw().toBuffer();
    expect([...selectedPixels.subarray(0, 4)]).toEqual([20, 60, 200, 255]);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData, images = form.getAll("image[]") as Blob[];
      expect(images).toHaveLength(2); expect(Buffer.from(await images[1]!.arrayBuffer()).equals(atlas)).toBe(true);
      expect(Buffer.from(await images[0]!.arrayBuffer()).equals(selectedPhoto)).toBe(true);
      expect(form.get("prompt")).toBe(characterPrompt({ styled: true, ageYears: 6, qaStyleContractVersion: "board-matched-identity/v1" }));
      expect(form.get("quality")).toBe("medium"); expect(form.get("size")).toBe("1024x1024");
      return Response.json({ data: [{ b64_json: atlas.toString("base64") }], usage: { input_tokens: 1, output_tokens: 1 } }, { headers: { "x-request-id": "synthetic-identity-style" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await new OpenAiAvatarProvider("synthetic-never-live", { tries: 1 }).createCharacter(input);
    expect(result.sheetWidth).toBe(1024); expect(result.providerRequestId).toBe("synthetic-identity-style"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
