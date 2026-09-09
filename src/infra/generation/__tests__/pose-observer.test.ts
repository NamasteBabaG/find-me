import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sha256Rgba, visibleSpriteSourceSchema } from "../../../services/generation/fixed-sprite";
import { OpenAiPoseObserver, POSE_OBSERVER_MODEL, POSE_OBSERVER_VERSION, POSE_OBSERVER_MIN_CONFIDENCE, POSE_OBSERVER_TIMEOUT_MS, poseObserverPrompt } from "../pose-observer";

let png: Buffer;
beforeAll(async () => {
  // Opaque torso/face, two separated legs. Their derived midpoint is transparent.
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 240; rgba[i + 2] = 210; }
  for (let y = 60; y < 950; y++) for (let x = 262; x < 762; x++) {
    if (y >= 700 && x >= 462 && x < 562) continue;
    const i = (y * 1024 + x) * 4; rgba[i] = 128; rgba[i + 1] = 80; rgba[i + 2] = 64; rgba[i + 3] = 255;
  }
  png = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
});
const point = (x: number, y: number) => ({ status: "observed", point: { x, y }, confidence: 0.95, reason: "Directly visible feature" });
function observation() {
  return { poseId: "standing", figureCount: 1, extraProps: false, poseMatches: true, completeFigure: true,
    landmarks: { eyeMidpoint: point(0.5, 0.16), chin: point(0.5, 0.27), leftFoot: point(0.6, 950 / 1024), rightFoot: point(0.4, 950 / 1024) },
    protectedFacePolygon: { status: "observed", polygon: [{ x: 0.45, y: 0.12 }, { x: 0.55, y: 0.12 }, { x: 0.55, y: 0.26 }, { x: 0.45, y: 0.26 }], confidence: 0.95, reason: "Whole visible facial skin and features" },
    reason: "One complete standing figure with both pupils, chin and soles visible",
  };
}
function response(content: unknown = observation(), overrides: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({ id: "chatcmpl-pose", model: POSE_OBSERVER_MODEL, service_tier: "default", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 }, ...overrides }), { status, headers: { "x-request-id": "req_pose" } });
}
function client(fetch: ReturnType<typeof vi.fn>, timeoutMs?: number) { return new OpenAiPoseObserver("test-key", { fetch: fetch as typeof globalThis.fetch, timeoutMs }); }

describe("standing source-only visible landmark observer", () => {
  it("pins one full1024 neutral-gray input, exact model/high effort and source frame provenance", async () => {
    const fetch = vi.fn().mockResolvedValue(response()), result = await client(fetch).observe(png);
    expect(result).toMatchObject({ status: "ok", approved: true, costCents: 1.8, costUnknown: false, costBasis: "conservative-upper-estimate", attempts: 1, requestId: "req_pose", modelReturned: POSE_OBSERVER_MODEL });
    const rgba = await sharp(png).ensureAlpha().raw().toBuffer();
    expect(result.source?.measurementFrame).toEqual({ rgbaSha256: sha256Rgba(rgba, 1024, 1024), width: 1024, height: 1024, cell: { id: "standing", left: 0, top: 0, width: 1024, height: 1024 }, coordinates: "cell-normalized-pixel-edges" });
    expect(result.source?.measurementVersion).toBe("visible-face/v1");
    expect(visibleSpriteSourceSchema.parse(result.source)).toEqual(result.source);
    expect(result.sourceImage.sha256).toBe(createHash("sha256").update(png).digest("hex"));
    expect(result.wireImage.sha256).toBe(createHash("sha256").update(result.wirePng).digest("hex"));
    expect(result.sourceImage.sha256).not.toBe(result.wireImage.sha256);
    const wire = await sharp(result.wirePng).raw().toBuffer({ resolveWithObject: true });
    expect(wire.info).toMatchObject({ width: 1024, height: 1024, channels: 3 }); expect([...wire.data.subarray(0, 3)]).toEqual([130, 130, 130]);
    expect(result.rawUsage).toEqual({ prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]![1], body = JSON.parse(request.body);
    expect(request.redirect).toBe("error"); expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(body).toMatchObject({ model: "gpt-5.6-sol", reasoning_effort: "high", max_completion_tokens: 8000, service_tier: "default", store: false });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toEqual([{ type: "text", text: result.promptSent }, { type: "image_url", image_url: { url: `data:image/png;base64,${result.wirePng.toString("base64")}`, detail: "high" } }]);
  });

  it("derives a transparent sole midpoint without accepting it as observed input", async () => {
    const result = await client(vi.fn().mockResolvedValue(response())).observe(png);
    expect(result.source?.landmarks).not.toHaveProperty("soleMidpoint");
    expect(result.derived?.soleMidpoint).toEqual({ x: 0.5, y: 950 / 1024 });
    expect(result.derived?.eyeToChinDistancePx).toBeCloseTo(112.64);
    const payload: any = observation(); payload.landmarks.soleMidpoint = point(0.5, 0.9);
    expect(await client(vi.fn().mockResolvedValue(response(payload))).observe(png)).toMatchObject({ status: "invalid", source: null, derived: null });
  });

  it("exposes a pinned visible-only prompt and does not claim confidence proves correctness", () => {
    const prompt = poseObserverPrompt();
    expect(POSE_OBSERVER_VERSION).toBe("visible-landmarks/v1"); expect(POSE_OBSERVER_TIMEOUT_MS).toBe(240000); expect(POSE_OBSERVER_MIN_CONFIDENCE).toBe(0.85);
    expect(prompt).toContain("TWO VISIBLE PUPILS"); expect(prompt).toContain("visible underside of the chin"); expect(prompt).toContain("Do not estimate skull top or hidden pelvis");
    expect(prompt).toContain("Self-reported confidence is not a guarantee"); expect(prompt).toContain("no board, destination, expected coordinates, identity reference or human labels");
    expect(prompt).toContain("ALPHA integrity guard, not a color detector"); expect(prompt).toContain("one quarter");
    expect(() => poseObserverPrompt("seated" as "standing")).toThrow("Only the standing");
  });

  it.each(["missing", "range", "legacy-head", "extra-field", "wrong-pose"])("does not approve malformed %s schema", async kind => {
    const payload: any = observation();
    if (kind === "missing") delete payload.landmarks.chin;
    if (kind === "range") payload.landmarks.eyeMidpoint.point.x = 2;
    if (kind === "legacy-head") payload.landmarks.headTop = point(0.5, 0.1);
    if (kind === "extra-field") payload.approved = true;
    if (kind === "wrong-pose") payload.poseId = "seated";
    const fetch = vi.fn().mockResolvedValue(response(payload));
    expect(await client(fetch).observe(png)).toMatchObject({ status: "invalid", approved: false, source: null, costUnknown: false }); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["low-confidence", "hidden-pupil", "hidden-sole", "unknown-semantic"])("holds %s without guessing or relaxing confidence", async kind => {
    const payload: any = observation();
    if (kind === "low-confidence") payload.landmarks.chin.confidence = 0.84;
    if (kind === "hidden-pupil") payload.landmarks.eyeMidpoint = { status: "uncertain", point: null, confidence: 0.99, reason: "One pupil hidden by hair" };
    if (kind === "hidden-sole") payload.landmarks.rightFoot = { status: "uncertain", point: null, confidence: 0.95, reason: "Contact edge hidden" };
    if (kind === "unknown-semantic") payload.completeFigure = null;
    expect(await client(vi.fn().mockResolvedValue(response(payload))).observe(png)).toMatchObject({ status: "uncertain", approved: false, source: null, derived: null });
  });

  it.each(["prop", "two-figures", "seated", "truncated"])("rejects %s despite high point confidence", async kind => {
    const payload = observation();
    if (kind === "prop") payload.extraProps = true;
    if (kind === "two-figures") payload.figureCount = 2;
    if (kind === "seated") payload.poseMatches = false;
    if (kind === "truncated") payload.completeFigure = false;
    expect(await client(vi.fn().mockResolvedValue(response(payload))).observe(png)).toMatchObject({ status: "invalid", approved: false, source: null });
  });

  it.each(["reversed-face", "duplicate-feet", "feet-above-face", "transparent-sole", "crossed-polygon", "tiny-cheek", "face-on-clothes", "off-centre-cheek"])("rejects %s geometry", async kind => {
    const payload = observation();
    if (kind === "reversed-face") payload.landmarks.chin.point.y = 0.1;
    if (kind === "duplicate-feet") payload.landmarks.rightFoot.point = { ...payload.landmarks.leftFoot.point };
    if (kind === "feet-above-face") payload.landmarks.rightFoot.point.y = 0.2;
    if (kind === "transparent-sole") payload.landmarks.rightFoot.point.x = 0.5;
    if (kind === "crossed-polygon") [payload.protectedFacePolygon.polygon[1], payload.protectedFacePolygon.polygon[2]] = [payload.protectedFacePolygon.polygon[2]!, payload.protectedFacePolygon.polygon[1]!];
    if (kind === "tiny-cheek") payload.protectedFacePolygon.polygon = [{ x: 0.49, y: 0.2 }, { x: 0.51, y: 0.2 }, { x: 0.51, y: 0.21 }, { x: 0.49, y: 0.21 }];
    if (kind === "face-on-clothes") payload.protectedFacePolygon.polygon.forEach(p => { p.y += 0.3; });
    if (kind === "off-centre-cheek") payload.protectedFacePolygon.polygon.forEach(p => { p.x += 0.1; });
    expect(await client(vi.fn().mockResolvedValue(response(payload))).observe(png)).toMatchObject({ status: "invalid", approved: false, source: null });
  });

  it("allows exactly two pixels of opaque-foot boundary tolerance without snapping", async () => {
    const payload = observation(); payload.landmarks.leftFoot.point.y = 952 / 1024;
    const accepted = await client(vi.fn().mockResolvedValue(response(payload))).observe(png);
    expect(accepted.approved).toBe(true); expect(accepted.source?.landmarks.leftFoot.y).toBe(952 / 1024);
    payload.landmarks.leftFoot.point.y = 952.01 / 1024;
    const rejected = await client(vi.fn().mockResolvedValue(response(payload))).observe(png);
    expect(rejected).toMatchObject({ status: "invalid", source: null }); expect(rejected.reason).toContain("within two pixels");
  });

  it("accepts opaque dark eye features, but rejects real interior alpha holes", async () => {
    const rgba = await sharp(png).ensureAlpha().raw().toBuffer();
    const i = (Math.floor(0.16 * 1024) * 1024 + Math.floor(0.5 * 1024)) * 4;
    rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0;
    const dark = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
    expect((await client(vi.fn().mockResolvedValue(response())).observe(dark)).approved).toBe(true);
    rgba[i + 3] = 0;
    const hole = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
    expect((await client(vi.fn().mockResolvedValue(response())).observe(hole)).reason).toContain("transparent source pixels");
  });

  it.each([undefined, {}, { prompt_tokens: 0, completion_tokens: 0 }, { prompt_tokens: "2000", completion_tokens: 400 }, { prompt_tokens: Number.MAX_SAFE_INTEGER + 1, completion_tokens: 400 }, { prompt_tokens: 2000, completion_tokens: -1 }, { prompt_tokens: 2000, completion_tokens: 1.2 }, { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 1 }])("holds invalid/missing usage %j with unknown cost", async usage => {
    const fetch = vi.fn().mockResolvedValue(response(observation(), { usage }));
    expect(await client(fetch).observe(png)).toMatchObject({ status: "unknown", approved: false, source: null, costUnknown: true, requestId: "req_pose" }); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "gpt-4o", "gpt-5.6-sol-unexpected"])("does not substitute requested model for returned %s", async model => {
    expect(await client(vi.fn().mockResolvedValue(response(observation(), { model }))).observe(png)).toMatchObject({ status: "unknown", costUnknown: true, source: null, modelReturned: model ?? null });
  });

  it.each(["length", "refusal", "multiple", "tier", "over-cap", "missing-request-id"])("holds unexpected %s provenance", async kind => {
    const message = { content: JSON.stringify(observation()) }, overrides: Record<string, unknown> = {};
    if (kind === "length") overrides.choices = [{ finish_reason: "length", message }];
    if (kind === "refusal") overrides.choices = [{ finish_reason: "stop", message: { ...message, refusal: "Cannot measure" } }];
    if (kind === "multiple") overrides.choices = [{ finish_reason: "stop", message }, { finish_reason: "stop", message }];
    if (kind === "tier") overrides.service_tier = "priority";
    if (kind === "over-cap") overrides.usage = { prompt_tokens: 2000, completion_tokens: 8001 };
    const reply = response(observation(), overrides); if (kind === "missing-request-id") reply.headers.delete("x-request-id");
    const fetch = vi.fn().mockResolvedValue(reply);
    expect(await client(fetch).observe(png)).toMatchObject({ status: "unknown", approved: false, source: null }); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500])("never retries HTTP %s", async status => {
    const fetch = vi.fn().mockResolvedValue(response(null, { usage: undefined }, status));
    expect(await client(fetch).observe(png)).toMatchObject({ status: "unknown", costUnknown: true, httpStatus: status }); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["fetch", "body"])("times out hung %s within the one-request deadline", async kind => {
    const pending = new Promise<never>(() => {}), fetch = vi.fn().mockImplementation(() => kind === "fetch" ? pending : Promise.resolve({ status: 200, headers: new Headers({ "x-request-id": "req_body" }), text: () => pending }));
    const result = await client(fetch, 10).observe(png);
    expect(result).toMatchObject({ status: "unknown", costUnknown: true, source: null }); expect(result.reason).toContain("timed out");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    if (kind === "body") expect(result.requestId).toBe("req_body");
  });

  it("does not expose transport exception text or retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("secret provider text")), result = await client(fetch).observe(png);
    expect(result.costUnknown).toBe(true); expect(JSON.stringify(result)).not.toContain("secret provider text"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid source size, empty alpha and unsupported pose before any request", async () => {
    const fetch = vi.fn();
    const small = await sharp({ create: { width: 16, height: 16, channels: 4, background: "red" } }).png().toBuffer();
    await expect(client(fetch).observe(small)).rejects.toThrow("1024×1024");
    const empty = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(client(fetch).observe(empty)).rejects.toThrow("no opaque figure");
    await expect(client(fetch).observe(png, "seated" as "standing")).rejects.toThrow("Only the standing"); expect(fetch).not.toHaveBeenCalled();
  });
});
