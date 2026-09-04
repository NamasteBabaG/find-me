import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, expressionFor, slotPrompt, toneMatch } from "../generation/patch";

/**
 * The child has to look painted by the same hand as the board.
 *
 * The model paints her in its own house style — paler, softer, flatter than
 * the gouache around her. The tone pass pulls her toward the board; these pin
 * that it pulls gently, only ever toward more saturation, never touches the
 * board itself, and leaves a child who already matches alone.
 */
const W = 64;
const H = 64;
const N = W * H;

function paint(fill: (x: number, y: number) => [number, number, number]): Buffer {
  const out = Buffer.alloc(N * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fill(x, y);
      out.set([r, g, b], (y * W + x) * 3);
    }
  return out;
}
const inChild = (x: number, y: number) => Math.hypot(x - 32, y - 32) < 14;
const board = (x: number, y: number): [number, number, number] => ((x >> 3) + (y >> 3)) % 2 === 0 ? [230, 40, 40] : [40, 60, 220];
const original = paint(board);
const alpha = Buffer.alloc(N);
const allow = Buffer.alloc(N, 255);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) alpha[y * W + x] = inChild(x, y) ? 255 : 0;

function saturation(buf: Buffer, pick: (i: number) => boolean): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (!pick(i)) continue;
    const r = buf[i * 3]!;
    const g = buf[i * 3 + 1]!;
    const b = buf[i * 3 + 2]!;
    const mx = Math.max(r, g, b);
    sum += mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
    count++;
  }
  return sum / count;
}
function luminance(buf: Buffer, pick: (i: number) => boolean): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (!pick(i)) continue;
    sum += 0.299 * buf[i * 3]! + 0.587 * buf[i * 3 + 1]! + 0.114 * buf[i * 3 + 2]!;
    count++;
  }
  return sum / count;
}
const child = (i: number) => alpha[i]! >= 128;
const outside = (i: number) => alpha[i]! < 128;

describe("tone match", () => {
  it("pulls a washed-out child toward the board's saturation, by a bounded amount", () => {
    const pale = paint((x, y) => (inChild(x, y) ? [172, 150, 142] : board(x, y)));
    const before = saturation(pale, child);
    const out = toneMatch(pale, original, alpha, allow, N);
    const after = saturation(out, child);
    expect(after).toBeGreaterThan(before * 1.2);
    expect(after).toBeLessThan(before * 1.4 + 0.02);
  });

  it("leaves her brightness where it was — a dark coat stays dark", () => {
    const pale = paint((x, y) => (inChild(x, y) ? [172, 150, 142] : board(x, y)));
    const out = toneMatch(pale, original, alpha, allow, N);
    expect(Math.abs(luminance(out, child) - luminance(pale, child))).toBeLessThan(3);
  });

  it("never touches a pixel outside the child", () => {
    const pale = paint((x, y) => (inChild(x, y) ? [172, 150, 142] : board(x, y)));
    const out = toneMatch(pale, original, alpha, allow, N);
    for (let i = 0; i < N; i++) {
      if (!outside(i)) continue;
      expect(out[i * 3]).toBe(pale[i * 3]);
      expect(out[i * 3 + 1]).toBe(pale[i * 3 + 1]);
      expect(out[i * 3 + 2]).toBe(pale[i * 3 + 2]);
    }
  });

  it("leaves a child who already matches the board byte for byte", () => {
    const vivid = paint((x, y) => (inChild(x, y) ? board(x + 4, y) : board(x, y)));
    expect(toneMatch(vivid, original, alpha, allow, N).equals(vivid)).toBe(true);
  });

  it("does nothing with too little to measure", () => {
    const tiny = Buffer.alloc(N);
    for (let y = 30; y < 34; y++) for (let x = 30; x < 34; x++) tiny[y * W + x] = 255;
    const pale = paint((x, y) => (tiny[y * W + x] ? [172, 150, 142] : board(x, y)));
    expect(toneMatch(pale, original, tiny, allow, N).equals(pale)).toBe(true);
  });
});

describe("the hiding-spot prompt", () => {
  const prompt = slotPrompt({ mission: "Noa is pulling a sledge", bodyLabel: "by the sledges", childPx: 120, place: "Antarctica", placeNote: "Penguins, a red hut and the whitest snow there is.", expression: expressionFor("holding") });

  it("makes the sheet identity and the board everything else", () => {
    expect(prompt).toContain("decides WHO this child is");
    expect(prompt).toContain("same colour temperature, saturation and contrast");
    expect(prompt).not.toContain("same face, hair and outfit");
  });

  it("dresses the child for the place, and says the sheet's clothes are not a uniform", () => {
    expect(prompt).toContain("Dress the child for this place (Antarctica — Penguins, a red hut and the whitest snow there is.)");
    expect(prompt).toContain("not a uniform");
  });

  it("asks for an expression that fits the hiding, not a posed smile", () => {
    expect(prompt).toContain("never a fixed, posed smile");
    expect(prompt).toContain(expressionFor("holding"));
    expect(expressionFor("peeking")).toMatch(/giggle/);
    expect(expressionFor("holding")).toMatch(/concentrating/);
    expect(expressionFor(undefined)).toBeTruthy();
  });

  it("still asks for occlusion as a wish, and still refuses the re-render", () => {
    expect(prompt).toContain("Let whatever is naturally in front of the child overlap them");
    expect(prompt.startsWith("Return this exact picture with ONE child added")).toBe(true);
    expect(prompt.endsWith("Change nothing else.")).toBe(true);
  });

  it("was versioned, so old patches can be told from new ones", () => {
    expect(PROMPT_VERSION).toBe("slot-patch-v4");
  });
});
