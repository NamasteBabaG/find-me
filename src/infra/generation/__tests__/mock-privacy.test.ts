import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MockAvatarProvider } from "../mock";
import type { AvatarInput, AvatarProvider } from "../types";

describe("private-photo-free mock generation", () => {
  it("different photographs, crops and child details produce one generic sticker without source bytes", async () => {
    const red = await sharp({ create: { width: 64, height: 32, channels: 3, background: "red" } }).png().toBuffer();
    const blue = await sharp({ create: { width: 32, height: 64, channels: 3, background: "blue" } }).png().toBuffer();
    const marker = Buffer.from("SYNTHETIC PRIVATE SOURCE THAT MUST NEVER BE PUBLISHED");
    const inputs: AvatarInput[] = [
      { originalPhoto: red, mimeType: "image/png", crop: null, childName: "Synthetic A", ageYears: 2 },
      { originalPhoto: blue, mimeType: "image/png", crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, childName: "Synthetic B", ageYears: 10 },
      { originalPhoto: marker, mimeType: "image/png", crop: { x: 0, y: 0, w: 1, h: 1 }, childName: "Synthetic C", ageYears: 6 },
    ];
    const provider: AvatarProvider = new MockAvatarProvider();
    const outputs = await Promise.all(inputs.map(input => provider.createAvatar(input)));
    for (const output of outputs) {
      expect(output).toMatchObject({ width: 512, height: 512, costCents: 0, providerRequestId: "mock" });
      expect(output.png.equals(outputs[0]!.png)).toBe(true);
      expect(output.png.includes(red)).toBe(false);
      expect(output.png.includes(blue)).toBe(false);
      expect(output.png.includes(marker)).toBe(false);
      expect(await sharp(output.png).metadata()).toMatchObject({ format: "png", width: 512, height: 512, hasAlpha: true });
    }
    expect(provider.id).toBe("mock");
    expect(provider.createCharacter).toBeUndefined(); // Real-identity QA gates must still reject this provider.
  });
});
