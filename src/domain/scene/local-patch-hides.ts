import { z } from "zod";
import { BOARDS_PER_WORLD } from "../package";

/**
 * Where a child is painted into each board, how she is posed there, and the
 * rules a placement obeys.
 *
 * The renders are cheap to redo and the placements are not: each one cost paid
 * attempts to find, and finding them again means paying again. So the numbers
 * live here, in the product, rather than in the folder of the round that bought
 * them. Nothing here is an image - a placement is a rectangle, a pose and a
 * board - so this file carries no child's likeness and never can.
 *
 * The shape it describes:
 *
 *   crop   512x768 of the board, handed to the painter whole and pasted back whole
 *   mask   inside that crop, the only part the painter may fill
 *
 * The painter redraws everything it is given, which two paid renders settled:
 * prose did not stop it and an edit mask did not either. So the board is not
 * preserved by asking. It is preserved by taking back only the crop rectangle
 * and leaving every pixel outside it alone, which makes the choice of rectangle
 * the whole game.
 *
 * The mask is not one shape. A child kneeling in sand or sitting cross-legged on
 * a market floor is a short wide body, and a standing-height rectangle around
 * her either leaves her floating in it or invites the painter to stand her up.
 * So each pose brings its own box, and every box sits on the SAME ground line -
 * the bottom edge a standing child's feet would have reached - because that line
 * is what makes her belong to the depth she is drawn at.
 */

export const LOCAL_PATCH_CROP = Object.freeze({ width: 512, height: 768 });
/** Every board in this world is drawn at this size. */
export const LOCAL_PATCH_BOARD = Object.freeze({ width: 3072, height: 2048 });
/** Where a mask's left edge and ground line sit inside the crop, for every pose. */
export const LOCAL_PATCH_MASK_LEFT = 130;
export const LOCAL_PATCH_MASK_GROUND = 650;

export const HIDES_PER_BOARD = 3;

/**
 * How she is posed. Every one of these needs only ground and something to be
 * near, because a pose that needs a wall or a bench is a pose that is wrong
 * wherever there is not one, and a board is authored before anyone looks again.
 *
 * Ground alone is not enough for the low ones, though. A child sitting
 * cross-legged in the middle of a Tokyo crossing is drawn correctly and reads as
 * a mistake, so a board says whether people sit on its ground and the low poses
 * are refused where they do not.
 */
export const LocalPatchPose = z.enum(["standing", "walking", "peeking", "kneeling", "crouching", "sitting-cross-legged"]);
export type LocalPatchPose = z.infer<typeof LocalPatchPose>;

/** The box each pose needs, in crop pixels. Wider and shorter as she gets lower. */
export const POSE_MASK: Readonly<Record<LocalPatchPose, { width: number; height: number }>> = Object.freeze({
  standing: { width: 252, height: 500 },
  walking: { width: 268, height: 500 },
  peeking: { width: 252, height: 500 },
  kneeling: { width: 260, height: 380 },
  crouching: { width: 268, height: 330 },
  "sitting-cross-legged": { width: 284, height: 300 },
});

/** Kneeling, crouching or sitting: fine on sand, wrong on a road. */
export const LOW_POSES: readonly LocalPatchPose[] = Object.freeze(["kneeling", "crouching", "sitting-cross-legged"]);

export const LocalPatchHideSchema = z.object({
  id: z.string().min(1),
  left: z.number().int().min(0),
  top: z.number().int().min(0),
  pose: LocalPatchPose,
  /**
   * Which of the board's three authored missions this hide is the hiding place
   * for, by the target's id in `content/scenes/<board>/scene.json`.
   *
   * Written down rather than taken from the order of two lists. The engine has
   * to turn a hide into a row the player can tap, and that row hangs off a
   * scene target; a binding that lives in whichever array happens to be sorted
   * the same way is a binding nobody can check and everybody can break.
   *
   * NOTE, and it is not a small one: the authored slot under each of these
   * targets carries the hint text, and that text describes where the OLD engine
   * put the child ("Look by the surfboards"), not where this engine does. The
   * hint zone follows the patch - `targetGeometry` recentres it - but the words
   * do not, and they will be wrong until they are re-authored for these
   * placements. Nearest-slot matching was tried and is not the answer: on five
   * of the nine boards two hides come out nearest the same target, and on paris
   * all three do.
   */
  targetId: z.string().min(1),
}).strict();
export type LocalPatchHide = z.infer<typeof LocalPatchHideSchema>;

export const LocalPatchBoardSchema = z.object({
  board: z.string().min(1),
  art: z.string().min(1),
  /** What she is standing, kneeling or sitting on, in the words the painter gets. */
  ground: z.string().min(1),
  /**
   * Whether people put their bodies on this ground. Sand, snow, a forest floor
   * and a market floor: yes. A road, a crossing, a pavement with traffic on it:
   * no, and a child sitting there is a drawing mistake however well it is drawn.
   */
  sittable: z.boolean(),
  hides: z.array(LocalPatchHideSchema).length(HIDES_PER_BOARD),
}).strict();
export type LocalPatchBoard = z.infer<typeof LocalPatchBoardSchema>;

export const cropOf = (hide: LocalPatchHide) => ({ left: hide.left, top: hide.top, ...LOCAL_PATCH_CROP });

/** The masked box inside the crop: the pose's shape, sitting on the ground line. */
export const maskInCrop = (pose: LocalPatchPose) => {
  const box = POSE_MASK[pose];
  return { left: LOCAL_PATCH_MASK_LEFT, top: LOCAL_PATCH_MASK_GROUND - box.height, width: box.width, height: box.height };
};

/** The same box in board coordinates. */
export const maskOf = (hide: LocalPatchHide) => {
  const box = maskInCrop(hide.pose);
  return { left: hide.left + box.left, top: hide.top + box.top, width: box.width, height: box.height };
};

const overlaps1D = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;
const holds = (outer: { left: number; top: number; width: number; height: number }, inner: { left: number; top: number; width: number; height: number }) =>
  overlaps1D(outer.left, outer.left + outer.width, inner.left, inner.left + inner.width)
  && overlaps1D(outer.top, outer.top + outer.height, inner.top, inner.top + inner.height);

/**
 * Two hides on one board may not sit so close that one hide's crop contains the
 * other's masked area.
 *
 * Not squeamishness: the sprite for a hide is cut from the finished board at its
 * crop rectangle, so if that rectangle reaches into where the other child was
 * painted, the first hide's sprite carries the second child inside it and the
 * player sees her twice - once where she belongs and once as a passenger. The
 * crops themselves may touch; it is the masked area that must stay outside.
 */
export function hidesCollide(a: LocalPatchHide, b: LocalPatchHide): boolean {
  return holds(cropOf(a), maskOf(b)) || holds(cropOf(b), maskOf(a));
}

/** Throws on the first placement a board cannot actually hold. */
export function assertPlaceable(board: LocalPatchBoard): void {
  for (const hide of board.hides) {
    const crop = cropOf(hide);
    if (crop.left + crop.width > LOCAL_PATCH_BOARD.width || crop.top + crop.height > LOCAL_PATCH_BOARD.height) {
      throw new Error(`LOCAL_PATCH: ${hide.id} runs off the edge of ${board.board}`);
    }
    const box = maskInCrop(hide.pose);
    if (box.left + box.width > LOCAL_PATCH_CROP.width || box.top < 0) {
      throw new Error(`LOCAL_PATCH: the ${hide.pose} box does not fit the crop at ${hide.id}`);
    }
    if (!board.sittable && LOW_POSES.includes(hide.pose)) {
      throw new Error(`LOCAL_PATCH: ${hide.id} is ${hide.pose} on ${board.ground}, which nobody sits on`);
    }
  }
  for (const [i, a] of board.hides.entries()) for (const b of board.hides.slice(i + 1)) {
    if (hidesCollide(a, b)) throw new Error(`LOCAL_PATCH: ${a.id} and ${b.id} are too close - one sprite would carry the other child`);
    // Two hides under one mission is one mission with no hiding place and one
    // child the player is never asked to find. The board owes three.
    if (a.targetId === b.targetId) throw new Error(`LOCAL_PATCH: ${a.id} and ${b.id} both claim the ${a.targetId} mission on ${board.board}`);
  }
}

/**
 * The nine boards of the first world, with the three places a child is painted
 * into each and how she is posed at every one.
 *
 * The rectangles were authored by eye against the board and confirmed by a paid
 * render at every one of them, over four rounds. The poses are authored the same
 * way and deliberately vary: a world where all twenty-seven appearances are a
 * child standing facing the reader is twenty-seven of the same picture, and this
 * engine can just as easily paint her kneeling in the sand or sitting on a market
 * floor. Each pose here needs nothing of its spot but ground and a neighbour.
 *
 * Where the ground is a road, the low poses are not authored and `assertPlaceable`
 * would refuse them: a child crouching in the middle of a Tokyo crossing is drawn
 * correctly and still reads as a mistake. Those boards get walking instead, which
 * is what everybody else on a crossing is doing.
 */
export const WORLD_LOCAL_PATCH_HIDES: readonly LocalPatchBoard[] = Object.freeze([
  { board: "sydney", art: "public/scenes/sydney/refresh-20260907/base.webp", ground: "beach sand", sittable: true,
    hides: [{ id: "sydney-1", left: 960, top: 1256, pose: "standing", targetId: "lifeguard" }, { id: "sydney-2", left: 1600, top: 1256, pose: "kneeling", targetId: "surfboards" }, { id: "sydney-3", left: 2176, top: 1128, pose: "sitting-cross-legged", targetId: "rocks" }] },
  { board: "antarctica", art: "public/scenes/antarctica/refresh-20260907/base.webp", ground: "packed snow", sittable: true,
    hides: [{ id: "antarctica-1", left: 128, top: 1000, pose: "standing", targetId: "penguins" }, { id: "antarctica-2", left: 1408, top: 1192, pose: "crouching", targetId: "sledge" }, { id: "antarctica-3", left: 2432, top: 1256, pose: "kneeling", targetId: "ice" }] },
  { board: "giza", art: "public/scenes/giza/refresh-20260907/base.webp", ground: "desert sand", sittable: true,
    hides: [{ id: "giza-1", left: 2176, top: 1256, pose: "standing", targetId: "camel" }, { id: "giza-2", left: 0, top: 1128, pose: "sitting-cross-legged", targetId: "stall" }, { id: "giza-3", left: 1344, top: 1128, pose: "peeking", targetId: "stones" }] },
  { board: "tokyo", art: "work/fixed-world-simple-20260908/dense/assembled-static-v1/tokyo/board.png", ground: "wet crossing", sittable: false,
    hides: [{ id: "tokyo-1", left: 896, top: 1256, pose: "standing", targetId: "crossing" }, { id: "tokyo-2", left: 2048, top: 1128, pose: "peeking", targetId: "stall" }, { id: "tokyo-3", left: 1408, top: 1256, pose: "walking", targetId: "blossom" }] },
  { board: "amazon", art: "work/fixed-world-simple-20260908/dense/amazon-static-seam-v2/board.png", ground: "forest floor", sittable: true,
    hides: [{ id: "amazon-1", left: 0, top: 1128, pose: "standing", targetId: "canoe" }, { id: "amazon-2", left: 704, top: 1192, pose: "crouching", targetId: "macaw" }, { id: "amazon-3", left: 2560, top: 1256, pose: "kneeling", targetId: "roots" }] },
  { board: "greatwall", art: "work/fixed-world-simple-20260908/dense/assembled-static-v1/greatwall/board.png", ground: "stone walkway", sittable: true,
    hides: [{ id: "greatwall-1", left: 960, top: 1256, pose: "standing", targetId: "dragon" }, { id: "greatwall-2", left: 2560, top: 1256, pose: "peeking", targetId: "lanterns" }, { id: "greatwall-3", left: 384, top: 1064, pose: "sitting-cross-legged", targetId: "tower" }] },
  { board: "marrakech", art: "public/scenes/marrakech/refresh-20260907/base.webp", ground: "market sand", sittable: true,
    hides: [{ id: "marrakech-1", left: 2560, top: 1256, pose: "standing", targetId: "lanterns" }, { id: "marrakech-4", left: 1408, top: 1088, pose: "peeking", targetId: "carpets" }, { id: "marrakech-5", left: 256, top: 1216, pose: "sitting-cross-legged", targetId: "spices" }] },
  { board: "newyork", art: "work/fixed-world-simple-20260908/city-final-v1/newyork/board-static.png", ground: "city pavement", sittable: false,
    hides: [{ id: "newyork-1", left: 0, top: 1064, pose: "standing", targetId: "taxi" }, { id: "newyork-3", left: 1472, top: 1128, pose: "peeking", targetId: "pretzel" }, { id: "newyork-4", left: 960, top: 1024, pose: "walking", targetId: "bench" }] },
  { board: "paris", art: "work/fixed-world-simple-20260908/city-final-v1/paris/board-static.png", ground: "cobbled square", sittable: true,
    hides: [{ id: "paris-3", left: 1152, top: 1256, pose: "standing", targetId: "bakery" }, { id: "paris-4", left: 640, top: 1280, pose: "peeking", targetId: "carousel" }, { id: "paris-5", left: 1536, top: 1152, pose: "kneeling", targetId: "awning" }] },
] satisfies LocalPatchBoard[]);

/** Nine boards, three hides each: what a world owes a player. */
export const WORLD_LOCAL_PATCH_HIDE_COUNT = BOARDS_PER_WORLD * HIDES_PER_BOARD;
