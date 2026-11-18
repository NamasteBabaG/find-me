/**
 * How a parent's photo sits in the round frame: the stored crop of a photo, and
 * the opening crop the photo step chooses from a found face.
 *
 * The crop is a square in the photo's pixels, normalised to the photo (0..1),
 * exactly what the upload sends and the server stores (`photoCropJson`).
 */
export interface PhotoCrop { x: number; y: number; w: number; h: number }

const unit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/** The stored crop, or null for a missing or malformed one (the photo is then shown centred). */
export function parsePhotoCrop(json: string | null | undefined): PhotoCrop | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json) as Record<string, unknown>;
    if (!unit(c.x) || !unit(c.y) || !unit(c.w) || !unit(c.h) || c.w === 0 || c.h === 0) return null;
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  } catch {
    return null;
  }
}

/** CSS for the photo inside a round frame of any size, so it shows exactly the crop. Percentages of the frame. */
export function cropStyle(crop: PhotoCrop) {
  return {
    width: `${100 / crop.w}%`, height: `${100 / crop.h}%`,
    left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`,
  };
}

export interface FaceBox { x: number; y: number; width: number; height: number }
export interface Framing { zoom: number; aim: { x: number; y: number } }

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/**
 * Where the circle opens. With a face: the face's box runs from the brow to the
 * chin, so the circle is two and a half times its width (hair above, a collar
 * below) and centred above the middle of the face. Without
 * one: where a phone portrait puts a head, not the dead centre.
 */
export function openingFrame(face: FaceBox | null, photo: { w: number; h: number }, box: number): Framing {
  if (!face) return { zoom: MIN_ZOOM, aim: { x: 0.5, y: 0.42 } };
  const cover = Math.max(box / photo.w, box / photo.h);
  // 2.5 face widths, centred a third of the way down the face: about 0.9 of a face of hair above
  // the brow and 0.6 below the chin. A child's hair is most of what makes the character theirs.
  const wanted = Math.max(face.width, face.height) * 2.5;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, box / (wanted * cover)));
  return { zoom, aim: { x: (face.x + face.width / 2) / photo.w, y: (face.y + face.height * 0.35) / photo.h } };
}

/** The image's offset in the circle (px) that puts `aim` in the middle, kept so the photo always covers the circle. */
export function offsetFor(framing: Framing, photo: { w: number; h: number }, box: number) {
  const cover = Math.max(box / photo.w, box / photo.h);
  const drawn = { w: photo.w * cover * framing.zoom, h: photo.h * cover * framing.zoom };
  return {
    x: Math.min(0, Math.max(box - drawn.w, box / 2 - framing.aim.x * drawn.w)),
    y: Math.min(0, Math.max(box - drawn.h, box / 2 - framing.aim.y * drawn.h)),
  };
}

/** A face that stays this small in the circle even at full zoom makes a poor character: say so. */
export function faceTooSmall(face: FaceBox, photo: { w: number; h: number }, box: number): boolean {
  const cover = Math.max(box / photo.w, box / photo.h);
  return face.width * cover * MAX_ZOOM < box * 0.28;
}
