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
  ageYears?: number | null;
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
  /** The provider answered without usage, so the charge is unknown — not zero. */
  costUnknown?: boolean;
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
  /** Overrides the provider's default for this one call. */
  quality?: string;
  /** Absolute time (ms since epoch) by which the answer must be back; the provider trims its own budget to it. */
  deadlineAt?: number;
}

export interface SlotPatchResponse extends GenerationCost {
  /** The edited crop, the same size as the crop that went in. */
  png: Buffer;
  /** The model's own output before it was fitted back to the crop, when the provider has one. Evidence, never shipped. */
  rawPng?: Buffer;
  /** The prompt as it went over the wire, with whatever the provider added. */
  promptSent?: string;
}

/**
 * Pass two of a hiding spot: the render again, and the crop it was made
 * from, so the model can cut the child out of its own work. A colour
 * difference cannot: the model re-synthesises the whole masked window, so
 * the difference is the window, not the child (see extractChild).
 */
export interface SlotMatteRequest {
  /** The edited crop (the scene with the child painted in), at the crop's own size. */
  edited: Buffer;
  /** The crop before the edit, the same size. */
  original: Buffer;
  /** Which figure is the child: the placement recipe's pose and occlusion, or empty. */
  hint: string;
  /** White-on-black paint area at the crop's size — where the child was asked to be. Sent as a third image, so a figure that was already in the scene is not mistaken for her. */
  mask?: Buffer;
  /** Identity sheet: distinguishes the inserted child from nearby background children. */
  reference?: Buffer;
  /** What the previous pass-two answer got wrong, when this is a retry on the same render. */
  retryHint?: string;
  /** For logs: "beach/sandcastle/A". */
  label: string;
  /** Overrides the provider's default for this one call. */
  quality?: string;
  /** Absolute time (ms since epoch) by which the answer must be back. */
  deadlineAt?: number;
}

export interface SlotMatteResponse extends GenerationCost {
  /** RGBA PNG the size of the edited crop: the child opaque, everything else transparent. Empty when `problem` is set. */
  png: Buffer;
  /**
   * The paid answer came back but could not be turned into a matte (it was not
   * on a magenta key, or the keying failed). The bill, the usage, the request
   * id and the raw picture are all still here: a charge is never lost to a
   * local failure. The caller treats it as a failed extraction, not a render.
   */
  problem?: string;
  /** The model's own output before it was fitted back, when the provider has one. Evidence, never shipped. */
  rawPng?: Buffer;
  /** The prompt as it went over the wire. */
  promptSent?: string;
  /** The input fidelity the model actually served (null when it refused the parameter). */
  inputFidelity?: "high" | "low" | null;
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
  /** Present only on providers that can cut the child out of their own render (pass two; see extractChild). */
  matteSlotCrop?(request: SlotMatteRequest): Promise<SlotMatteResponse>;
  /**
   * The square the provider sends the crop as, and gets the edit back as. The
   * prompt names the child's height in that space (see modelSpaceHeight);
   * undefined means the crop is sent at its own size.
   */
  readonly patchOutputPx?: number;
}

/** What a judge concluded about one finished patch. */
export type PatchVerdict = "ok" | "bad" | "unknown";

export interface PatchJudgement {
  verdict: PatchVerdict;
  /** A few words, stored so a rejection can be understood later. */
  reason: string;
  costCents: number;
  /** At least one attempted request has no trustworthy usage/pricing. Never free. */
  costUnknown?: boolean;
  model?: string;
  promptSent?: string;
  attempts?: JudgeAttempt[];
  version?: string;
  checks?: import("./board-verdict").BoardChecks;
  /** Hashes of the exact encoded images sent to the judge, in wire order. */
  imageHashes?: string[];
  reviews?: PatchJudgement[];
}

export interface JudgeAttempt {
  requestId: string | null;
  model: string | null;
  usage: Record<string, unknown> | null;
  costCents: number;
  costUnknown: boolean;
  status: number | null;
  responseText?: string;
}

/**
 * Looks at a finished patch beside the child's identity sheet and says whether
 * the patch is that child.
 *
 * Separate from AvatarProvider on purpose: drawing and judging are different
 * capabilities, and a deployment may reasonably want one without the other.
 */
export interface PatchJudge {
  readonly id: string;
  judge(input: PatchJudgeInput): Promise<PatchJudgement>;
}

export interface PatchJudgeInput {
  patchPng: Buffer;
  reference: Buffer;
  childName: string;
  ageYears?: number | null;
  label: string;
  /** Final composition, not a raw generation or a white-background cut-out. */
  boardCrop?: Buffer;
}

export interface FaceDetection {
  count: number;
  /** Suggested square crop around the most prominent face, if any. */
  box: CropBox | null;
}

export interface FaceDetector {
  detect(photo: Buffer): Promise<FaceDetection>;
}
