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

/**
 * Image generation behind an interface. The mock produces a real "photo
 * sticker" (crop + circle + white outline) so the whole product works with
 * zero generation credits; a future provider can return full sprites.
 */
export interface AvatarProvider {
  readonly id: "mock" | "replicate" | "openai";
  createAvatar(input: AvatarInput): Promise<AvatarOutput>;
  createTargetSprite(input: TargetSpriteInput): Promise<TargetSpriteOutput>;
}

export interface FaceDetection {
  count: number;
  /** Suggested square crop around the most prominent face, if any. */
  box: CropBox | null;
}

export interface FaceDetector {
  detect(photo: Buffer): Promise<FaceDetection>;
}
