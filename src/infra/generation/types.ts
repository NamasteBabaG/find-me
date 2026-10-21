import type { BackgroundProviderError } from "../../domain/generation/background-provider-error";

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

/** Explicit opt-in for the QA board-conditioned wizard. The atlas contains
 * original illustrated board people only, never another uploaded child's photo. */
export interface QaCharacterStyleContract {
  version: "board-matched-identity/v1" | "board-matched-identity/v2" | "board-matched-identity/v3" | "board-matched-identity/v4" | "board-matched-identity/v5" | "board-matched-identity/v6";
  catalogSha256: string;
  atlasSha256: string;
}
export interface CharacterInput extends AvatarInput {
  /** One bounded likeness repair; prior judge text is evidence, not instructions. */
  identityRepair?: { reason: string };
  /** If present, styleRef is mandatory and must match this exact atlas hash. */
  qaStyleContract?: QaCharacterStyleContract;
  /** A queue deadline, excluding the time needed to retain the identity. */
  deadlineAt?: number;
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
  /**
   * How the spot hides her (occlusionMode). In `layer` mode nothing in the
   * render is in front of the child — the board's foreground layer is drawn
   * over her afterwards — so pass two must keep her whole; in the other two
   * an object in front of her is painted magenta and the visible part kept.
   */
  mode?: "open" | "clipped" | "layer";
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
 * Image generation behind an interface. The mock produces a generic illustrated
 * sticker, independent of private photo inputs, so the whole product works with
 * zero generation credits; a real provider draws the child and paints her in.
 */
export interface AvatarProvider {
  readonly id: "mock" | "replicate" | "openai";
  createAvatar(input: AvatarInput): Promise<AvatarOutput>;
  createTargetSprite(input: TargetSpriteInput): Promise<TargetSpriteOutput>;
  /** Present only on providers that can draw the child in the worlds' style. */
  createCharacter?(input: CharacterInput): Promise<CharacterOutput>;
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
  /**
   * The exact encoded images that went over the wire, in the same order as
   * `imageHashes` — kept by the pipeline as private evidence per attempt and
   * stripped before the judgement is written as JSON.
   */
  wireImages?: Buffer[];
  reviews?: PatchJudgement[];
  /** Which reviewer decided, under which policy (see JudgePolicy). */
  policy?: string;
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
  /**
   * The spot's recipe, so the judge knows what a correct picture is: the
   * pose, what holds her, what is in front of her, and the people she is
   * to be measured against. Without it the judge demanded visible feet of a
   * child peeking over a stone block (game 2, 8 September 2026).
   */
  recipe?: JudgeRecipe;
}

export interface JudgeRecipe {
  pose: string;
  support: string;
  occlusion: string;
  /** open: nothing authored in front; clipped/layer: the named object hides part of her by design. */
  occlusionMode: "open" | "clipped" | "layer";
  /** The neighbours a person measured, in words. */
  comparators?: string;
  /** How much of her is meant to show, as a fraction of her standing height. */
  visibleFraction?: number;
}

export interface FaceDetection {
  count: number;
  /** Suggested square crop around the most prominent face, if any. */
  box: CropBox | null;
}

export interface FaceDetector {
  detect(photo: Buffer): Promise<FaceDetection>;
}

/** One request's result in an ended batch, as the provider returned it. */
export type QualityBatchResult =
  | { readonly customId: string; readonly type: "succeeded"; readonly message: unknown }
  | { readonly customId: string; readonly type: "errored"; readonly errorType: string | null }
  | { readonly customId: string; readonly type: "canceled" | "expired" }
  | { readonly customId: string; readonly type: "unrecognized"; readonly resultType: string | null };
/** What a search proved: the batches carrying the question, with the results each was proved by (a batch's first
 * reading: rule 6 of the round), whether any could still carry it, and whether the search stopped short: out of pages
 * or time (`truncated`), or failing after it had proven or seen batches, which it still returns (`failed`, the reason).
 * `pending`: the batches it could not decide (still running, or unreadable), by their ids; `cleared`: the watched
 * batches it decided carry no copy (read without the question, or missing from a listing of the whole window). */
export type QualityBatchFound = {
  proven: string[]; undecided: boolean; truncated?: true; failed?: string;
  results?: Readonly<Record<string, readonly QualityBatchResult[]>>;
  pending?: readonly string[]; cleared?: readonly string[];
};
/** How many results of each type an ended batch's own record says it has. */
export type QualityBatchCounts = Readonly<Record<string, number>>;
export type QualityBatchStatus =
  | { readonly status: "in_progress" | "canceling"; readonly counts: null }
  | { readonly status: "ended"; readonly counts: QualityBatchCounts | null };

/**
 * A discounted, asynchronous channel for review questions (Anthropic Message
 * Batches). Each call is one HTTP request with no hidden retry. A create that
 * threw anything but `QualityBatchRefused` may have created a batch: only `find`
 * can say, and only after the batch carrying it has ended.
 */
export interface QualityBatchTransport {
  /** Provider AND billing namespace of every answer this channel delivers. */
  readonly namespace: string;
  create(requests: readonly { customId: string; params: Record<string, unknown> }[]): Promise<{ batchId: string }>;
  /** Batches created from `sinceMs` to `untilMs` proven to carry `customId`; undecided while one could and has not ended,
   * or when the search ran out of pages or of time before the intent (`truncated`). No read starts that could
   * end after `deadlineAt`. Throws when the provider's inventory cannot be shown complete: absence is never
   * inferred from a partial answer. A search that had already proven or seen batches returns them instead, undecided
   * (`failed`). `watch`: batches an earlier search could not decide, each reported `cleared` once this one decides it
   * carries no copy. */
  find(customId: string, sinceMs: number, deadlineAt?: number, untilMs?: number, known?: ReadonlySet<string>, watch?: ReadonlySet<string>): Promise<QualityBatchFound>;
  /** The batch's state, and for an ended batch what its record counts by result type (null when the record does not state them all). */
  status(batchId: string): Promise<QualityBatchStatus>;
  /** Every result of an ended batch, exactly as the batch's own record counts them by type, or a throw;
   * no read starts that could end after `deadlineAt`. `counts`: that record's counts as `status` read them,
   * which spares reading the record again. */
  results(batchId: string, deadlineAt?: number, counts?: QualityBatchCounts): Promise<QualityBatchResult[]>;
  cancel(batchId: string): Promise<void>;
  /** Deleted means acknowledged: already gone counts, anything else throws. */
  remove(batchId: string): Promise<void>;
}

/** What a background response says about one review, read exactly once per poll. */
export type BackgroundReviewReading = {
  readonly responseId: string; readonly raw: string | null; readonly usage: Record<string, unknown> | null;
  readonly model: string | null;
  /** "stop" for a completed message, "length" for a max-output cut, else the provider's reason or null. */
  readonly finishReason: string | null;
  readonly serviceTier: string | null;
  /** A failed, cancelled or incomplete response's own `error`, scrubbed (`sanitizeProviderError`); absent when it gave none. */
  readonly providerError?: BackgroundProviderError | null;
};
export type BackgroundReviewState =
  | { readonly status: "queued" | "in_progress" }
  | { readonly status: "completed" | "failed" | "cancelled" | "incomplete"; readonly reading: BackgroundReviewReading }
  /** The provider no longer has (or never had) this response id: documented 404. */
  | { readonly status: "missing" };

/**
 * A review question asked as an OpenAI background response (`background: true`) and
 * polled by id (GET /v1/responses/{id}). One HTTP request per call, no hidden retry,
 * `redirect: "error"`. A create that threw anything but `BackgroundReviewRefused` may
 * have created a response whose id never arrived: only an unknown charge can describe it.
 */
export interface BackgroundReviewTransport {
  /** Provider AND billing namespace of every answer this channel delivers. */
  readonly namespace: string;
  create(body: Readonly<Record<string, unknown>>): Promise<{ responseId: string }>;
  retrieve(responseId: string): Promise<BackgroundReviewState>;
  cancel(responseId: string): Promise<void>;
}

/** A background create refused with the provider's error envelope before anything was created. */
export class BackgroundReviewRefused extends Error {
  constructor(readonly status: number, readonly errorType: string | null) {
    super(`BACKGROUND_REVIEW: create refused (${status}${errorType ? ` ${errorType}` : ""}); nothing was created`);
    this.name = "BackgroundReviewRefused";
  }
}

/** A create the provider refused outright, so nothing was created. `transient`: the same request may be sent later. */
export class QualityBatchRefused extends Error {
  constructor(readonly status: number, readonly errorType: string | null, readonly transient: boolean) {
    super(`QUALITY_BATCH: create refused (${status}${errorType ? ` ${errorType}` : ""}); nothing was created`);
    this.name = "QualityBatchRefused";
  }
}
