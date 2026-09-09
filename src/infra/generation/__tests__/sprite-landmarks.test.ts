import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  OpenAiSpriteLandmarkObserver, SPRITE_LANDMARK_MODEL, SPRITE_LANDMARK_VERSION,
  SPRITE_LANDMARK_TIMEOUT_MS, spriteLandmarkPrompt,
} from "../sprite-landmarks";

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 240, g: 10, b: 210, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 500, height: 900, channels: 4, background: "#805040" } }).png().toBuffer(), left: 262, top: 62 }])
    .png().toBuffer();
});
const point = (x: number, y: number) => ({ status: "observed", point: { x, y }, confidence: 0.95, reason: "Visible anatomical feature" });
function observation() {
  return {
    poseId: "seated", figureCount: 1, extraProps: false, poseMatches: true, completeFigure: true,
    landmarks: { headTop: point(0.49, 0.12), headBottom: point(0.49, 0.27), seatContact: point(0.48, 0.55), leftFoot: point(0.6, 0.85), rightFoot: point(0.4, 0.85) },
    protectedFacePolygon: { status: "observed", polygon: [{ x: 0.46, y: 0.17 }, { x: 0.52, y: 0.17 }, { x: 0.52, y: 0.23 }, { x: 0.46, y: 0.23 }], confidence: 0.95, reason: "Interior cheek skin" },
    reason: "One seated figure; visible pelvic underside and separate feet",
  };
}
function response(content: unknown = observation(), overrides: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({
    id: "chatcmpl-landmarks", model: SPRITE_LANDMARK_MODEL, service_tier: "default",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 }, ...overrides,
  }), { status, headers: { "x-request-id": "req_landmarks" } });
}
function client(mock: ReturnType<typeof vi.fn>, timeoutMs?: number) {
  return new OpenAiSpriteLandmarkObserver("test-key", { fetch: mock as typeof globalThis.fetch, timeoutMs });
}

describe("source-only sprite landmark observer", () => {
  it("uses one full-canvas gray image and returns source-bound confident anatomy", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    const result = await client(fetch).observe(png, "seated");
    expect(result.status).toBe("ok"); expect(result.approved).toBe(true);
    expect(result.source?.landmarks.seatContact).toEqual({ x: 0.48, y: 0.55 });
    expect(result.sourceImage).toMatchObject({ width: 1024, height: 1024, bytes: png.length, sha256: createHash("sha256").update(png).digest("hex") });
    expect(result.wireImage.sha256).toBe(createHash("sha256").update(result.wirePng).digest("hex"));
    expect(result.wireImage.sha256).not.toBe(result.sourceImage.sha256);
    const wire = await sharp(result.wirePng).raw().toBuffer({ resolveWithObject: true });
    expect(wire.info).toMatchObject({ width: 1024, height: 1024, channels: 3 });
    expect([...wire.data.subarray(0, 3)]).toEqual([130, 130, 130]);
    expect(result).toMatchObject({ requestId: "req_landmarks", modelReturned: SPRITE_LANDMARK_MODEL, costCents: 1.8, costUnknown: false, costBasis: "conservative-upper-estimate", attempts: 1 });
    expect(result.rawUsage).toEqual({ prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]![1];
    expect(request.redirect).toBe("error"); expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ model: "gpt-5.6-sol", reasoning_effort: "high", max_completion_tokens: 8000, service_tier: "default", store: false });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: result.promptSent },
      { type: "image_url", image_url: { url: `data:image/png;base64,${result.wirePng.toString("base64")}`, detail: "high" } },
    ]);
  });

  it("exposes a pinned prompt defining anatomical head, pelvic seat and uncertainty", () => {
    const prompt = spriteLandmarkPrompt("seated");
    expect(SPRITE_LANDMARK_TIMEOUT_MS).toBe(240000);
    expect(prompt).toContain(SPRITE_LANDMARK_VERSION);
    expect(prompt).toContain("ANATOMICAL top of the skull");
    expect(prompt).toContain("weight-bearing buttocks/pelvis");
    expect(prompt).toContain("status uncertain with point null");
    expect(prompt).toContain("FIGURE'S anatomical left and right");
    expect(prompt).toContain("Include normal eyes, nose, nostrils and mouth");
    expect(prompt).toContain("ALPHA integrity guard, not a color detector");
    expect(prompt).toContain("no board, destination, expected coordinates, identity reference or human labels");
    expect(() => spriteLandmarkPrompt("standing" as "seated")).toThrow("Only the seated");
  });

  it.each(["missing", "range", "extra-field", "wrong-pose"])("never approves a malformed %s schema", async kind => {
    const payload: any = observation();
    if (kind === "missing") delete payload.landmarks.seatContact;
    if (kind === "range") payload.landmarks.headTop.point.x = 1.5;
    if (kind === "extra-field") payload.approved = true;
    if (kind === "wrong-pose") payload.poseId = "standing";
    const fetch = vi.fn().mockResolvedValue(response(payload));
    const result = await client(fetch).observe(png, "seated");
    expect(result).toMatchObject({ approved: false, source: null, status: "invalid", costUnknown: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["low-confidence", "hidden-seat", "unknown-semantics"])("holds %s without inventing coordinates", async kind => {
    const payload: any = observation();
    if (kind === "low-confidence") payload.landmarks.seatContact.confidence = 0.84;
    if (kind === "hidden-seat") payload.landmarks.seatContact = { status: "uncertain", point: null, confidence: 0.99, reason: "Pelvis is hidden" };
    if (kind === "unknown-semantics") payload.poseMatches = null;
    const fetch = vi.fn().mockResolvedValue(response(payload));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, source: null, status: "uncertain" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["prop", "two-figures", "standing", "truncated"])("refuses %s despite high landmark confidence", async kind => {
    const payload = observation();
    if (kind === "prop") payload.extraProps = true;
    if (kind === "two-figures") payload.figureCount = 2;
    if (kind === "standing") payload.poseMatches = false;
    if (kind === "truncated") payload.completeFigure = false;
    const fetch = vi.fn().mockResolvedValue(response(payload));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, source: null, status: "invalid" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["reversed-head", "duplicate-feet", "crossed-face", "face-on-clothes", "tiny-cheek", "transparent-seat"])("refuses %s geometry", async kind => {
    const payload = observation();
    if (kind === "reversed-head") payload.landmarks.headBottom.point.y = 0.1;
    if (kind === "duplicate-feet") payload.landmarks.rightFoot.point = { ...payload.landmarks.leftFoot.point };
    if (kind === "crossed-face") [payload.protectedFacePolygon.polygon[1], payload.protectedFacePolygon.polygon[2]] = [payload.protectedFacePolygon.polygon[2]!, payload.protectedFacePolygon.polygon[1]!];
    if (kind === "face-on-clothes") payload.protectedFacePolygon.polygon.forEach(p => { p.y += 0.4; });
    if (kind === "tiny-cheek") payload.protectedFacePolygon.polygon = [{ x: 0.48, y: 0.2 }, { x: 0.49, y: 0.2 }, { x: 0.49, y: 0.21 }, { x: 0.48, y: 0.21 }];
    if (kind === "transparent-seat") payload.landmarks.seatContact.point = { x: 0.01, y: 0.01 };
    const fetch = vi.fn().mockResolvedValue(response(payload));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, source: null, status: "invalid" });
  });

  it.each([undefined, {}, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, { prompt_tokens: "2000", completion_tokens: 400 }, { prompt_tokens: 2000, completion_tokens: -1 }, { prompt_tokens: 2000, completion_tokens: 1.2 }, { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 3 }])("holds missing or invalid usage %j with unknown cost", async usage => {
    const fetch = vi.fn().mockResolvedValue(response(observation(), { usage }));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, source: null, status: "unknown", costUnknown: true, requestId: "req_landmarks" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "gpt-4o", "gpt-5.6-sol-unexpected"])("never substitutes the requested model for %s", async model => {
    const fetch = vi.fn().mockResolvedValue(response(observation(), { model }));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, status: "unknown", costUnknown: true, modelReturned: model ?? null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["length", "refusal", "multiple", "tier", "over-cap"])("holds incomplete or unexpected %s telemetry", async kind => {
    const message = { content: JSON.stringify(observation()) };
    const overrides: Record<string, unknown> = {};
    if (kind === "length") overrides.choices = [{ finish_reason: "length", message }];
    if (kind === "refusal") overrides.choices = [{ finish_reason: "stop", message: { ...message, refusal: "Cannot measure" } }];
    if (kind === "multiple") overrides.choices = [{ finish_reason: "stop", message }, { finish_reason: "stop", message }];
    if (kind === "tier") overrides.service_tier = "priority";
    if (kind === "over-cap") overrides.usage = { prompt_tokens: 2000, completion_tokens: 8001 };
    const fetch = vi.fn().mockResolvedValue(response(observation(), overrides));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, source: null, status: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500])("does not retry HTTP %s", async status => {
    const fetch = vi.fn().mockResolvedValue(response(null, { usage: undefined }, status));
    expect(await client(fetch).observe(png, "seated")).toMatchObject({ approved: false, costUnknown: true, httpStatus: status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["fetch", "body"])("bounds a hung %s by the same single-request timeout", async kind => {
    const pending = new Promise<never>(() => {});
    const fetch = vi.fn().mockImplementation(() => kind === "fetch" ? pending : Promise.resolve({ status: 200, headers: new Headers({ "x-request-id": "req_body" }), text: () => pending }));
    const result = await client(fetch, 10).observe(png, "seated");
    expect(result).toMatchObject({ approved: false, source: null, status: "unknown", costUnknown: true });
    expect(result.reason).toContain("timed out");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    if (kind === "body") expect(result.requestId).toBe("req_body");
  });

  it("holds a transport error without exposing its text or retrying", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("secret provider detail"));
    const result = await client(fetch).observe(png, "seated");
    expect(result.costUnknown).toBe(true); expect(JSON.stringify(result)).not.toContain("secret provider detail");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("protects opaque facial features but rejects an actual alpha hole", async () => {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (Math.floor(0.2 * 1024) * 1024 + Math.floor(0.49 * 1024)) * info.channels;
    data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0;
    const darkEye = await sharp(data, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
    expect((await client(vi.fn().mockResolvedValue(response())).observe(darkEye, "seated")).approved).toBe(true);
    data[offset + 3] = 0;
    const missingEye = await sharp(data, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
    const result = await client(vi.fn().mockResolvedValue(response())).observe(missingEye, "seated");
    expect(result).toMatchObject({ approved: false, source: null, status: "invalid" });
    expect(result.reason).toContain("transparent source pixels");
  });

  it("rejects an invalid source before spending instead of resizing it", async () => {
    const fetch = vi.fn();
    const small = await sharp({ create: { width: 16, height: 16, channels: 4, background: "red" } }).png().toBuffer();
    await expect(client(fetch).observe(small, "seated")).rejects.toThrow("1024×1024");
    const empty = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(client(fetch).observe(empty, "seated")).rejects.toThrow("no opaque figure");
    expect(fetch).not.toHaveBeenCalled();
  });
});
