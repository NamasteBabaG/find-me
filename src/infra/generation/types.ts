export interface CropBox {
  /** Normalized against the original photo (0..1). Square in practice. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AvatarInput {
  originalPhoto: Buffer;
  mimeType: string;
  crop: CropBox | null;
  childName: string;
  /**
   * A piece of a real board, as the style to match.
   *
   * Words alone do not carry a painting style: described only as "warm
   * storybook collage", the model drew a soft, near-photographic child who then
   * had to be painted into saturated gouache — she looked pasted in, and half
   * the inpaints were rejected for it. Showing the style is what fixes both.
   */
  styleRef?: Buffer;
}

export interface AvatarOutput {
  png: Buffer;
  width: number;
  height: number;
  costCents: number;
  providerRequestId?: string;
}

export interface TargetSpriteInput {
  avatarPng: Buffer;
  sceneSlug: string;
  targetType: string;
  bodyTemplate: string;
  childName: string;
}

export type TargetSpriteOutput =
  | { kind: "composed"; costCents: 0 }
  | { kind: "image"; png: Buffer; width: number; height: number; costCents: number; providerRequestId?: string };

/** What a provider charged and how, so the real cost model comes from data. */
export interface GenerationCost {
  costCents: number;
  model: string;
  /** Provider-reported token usage, stored verbatim. */
  usage?: Record<string, number>;
  providerRequestId?: string;
  durationMs: number;
  attempts: number;
}

/**
 * The child drawn in the worlds' style, once per game.
 *
 * `sheetPng` is the identity sheet — the same child in several poses — and it
 * is the reference every slot patch is painted from, which is what keeps her
 * recognisable across nine worlds. `avatarPng` is the round face for covers.
 */
export interface CharacterOutput extends GenerationCost {
  sheetPng: Buffer;
  sheetWidth: number;
  sheetHeight: number;
  avatarPng: Buffer;
  avatarWidth: number;
  avatarHeight: number;
}

/** Paint the child into one window of a world (see docs/SPRITE_PATCHES.md). */
export interface SlotPatchRequest {
  /** The context crop taken from the base art (PNG). */
  crop: Buffer;
  /** White-on-black paint area, the same pixel size as the crop. */
  paintMask: Buffer;
  /** The child's identity sheet. */
  reference: Buffer;
  prompt: string;
  /** For logs: "beach/sandcastle/A". */
  label: string;
}

export interface SlotPatchResponse extends GenerationCost {
  /** The edited crop, the same size as the crop that went in. */
  png: Buffer;
}

/**
 * Image generation behind an interface. The mock produces a real "photo
 * sticker" (crop + circle + white outline) so the whole product works with
 * zero generation credits; a real provider draws the child and paints her in.
 */
export interface AvatarProvider {
  readonly id: "mock" | "replicate" | "openai";
  createAvatar(input: AvatarInput): Promise<AvatarOutput>;
  createTargetSprite(input: TargetSpriteInput): Promise<TargetSpriteOutput>;
  /** Present only on providers that can draw the child in the worlds' style. */
  createCharacter?(input: AvatarInput): Promise<CharacterOutput>;
  /** Present only on providers that can inpaint her into a world. */
  editSlotCrop?(request: SlotPatchRequest): Promise<SlotPatchResponse>;
}

export interface FaceDetection {
  count: number;
  /** Suggested square crop around the most prominent face, if any. */
  box: CropBox | null;
}

export interface FaceDetector {
  detect(photo: Buffer): Promise<FaceDetection>;
}
