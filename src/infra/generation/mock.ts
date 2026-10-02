import sharp from "sharp";
import type { AvatarInput, AvatarOutput, AvatarProvider, FaceDetection, FaceDetector, TargetSpriteInput, TargetSpriteOutput } from "./types";

const STICKER_SIZE = 512;
const GENERIC_AVATAR = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><clipPath id="sticker"><circle cx="256" cy="256" r="232"/></clipPath></defs>
  <circle cx="256" cy="256" r="254" fill="#fff"/>
  <g clip-path="url(#sticker)">
    <circle cx="256" cy="256" r="232" fill="#fff0c2"/>
    <ellipse cx="256" cy="496" rx="166" ry="142" fill="#6fbab3"/>
    <rect x="226" y="304" width="60" height="82" rx="24" fill="#eebfa1"/>
    <circle cx="165" cy="243" r="22" fill="#eebfa1"/><circle cx="347" cy="243" r="22" fill="#eebfa1"/>
    <ellipse cx="256" cy="236" rx="94" ry="112" fill="#f5cfaf"/>
    <path d="M165 226c-20-97 36-129 99-126 77 4 98 67 81 124-22-19-32-42-36-64-38 36-82 43-133 40Z" fill="#665049"/>
    <circle cx="220" cy="243" r="9" fill="#343241"/><circle cx="292" cy="243" r="9" fill="#343241"/>
    <path d="M255 251v17" fill="none" stroke="#d69d83" stroke-width="8" stroke-linecap="round"/>
    <path d="M227 294q29 27 58 0" fill="none" stroke="#665049" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="198" cy="276" rx="16" ry="9" fill="#efb8a6"/><ellipse cx="314" cy="276" rx="16" ry="9" fill="#efb8a6"/>
  </g>
</svg>`);

/**
 * A generic illustrated test sticker, independent of any child's photograph,
 * crop, name or age. Mock games may be shared, so a private upload must never
 * become a photographic GAME asset merely because real generation is disabled.
 */
export class MockAvatarProvider implements AvatarProvider {
  readonly id = "mock" as const;

  async createAvatar(_input: AvatarInput): Promise<AvatarOutput> {
    const png = await sharp(GENERIC_AVATAR).png().toBuffer();
    return { png, width: STICKER_SIZE, height: STICKER_SIZE, costCents: 0, providerRequestId: "mock" };
  }

  async createTargetSprite(_input: TargetSpriteInput): Promise<TargetSpriteOutput> {
    // Bodies are drawn procedurally by the renderer — nothing to generate.
    return { kind: "composed", costCents: 0 };
  }
}

/** No ML yet: the parent crops manually. Swapping in a real detector is one class. */
export class NoopFaceDetector implements FaceDetector {
  async detect(): Promise<FaceDetection> {
    return { count: 1, box: null };
  }
}
