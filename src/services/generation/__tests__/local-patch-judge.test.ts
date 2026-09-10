import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { JUDGE_CHECKS, LOCAL_PATCH_JUDGE, judgeLocalPatch, localPatchJudgePrompt, localPatchVerdictSchema } from "../local-patch-judge";

const png = () => sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 200, g: 160, b: 120, alpha: 255 } } }).png().toBuffer();
const good = {
  childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
  scaleRight: "pass", groundContact: "pass", styleMatch: "pass", verdict: "pass", reason: "She stands on the sand at the right height.", faults: [],
};
const reply = (content: unknown, status = 200) => new Response(JSON.stringify({
  choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
  usage: { prompt_tokens: 900, completion_tokens: 120 },
}), { status, headers: { "x-request-id": "req-judge" } });

async function request() {
  const image = await png();
  return { hideId: "sand-strip-by-the-rocks", beforePng: image, afterPng: image, identityPng: image };
}

describe("judging one finished local patch", () => {
  it("asks about the things pixels cannot answer, and allows a clean replacement", () => {
    const prompt = localPatchJudgePrompt("in-front-of-the-surfboards");
    expect(prompt).toContain("in-front-of-the-surfboards");
    expect(prompt).toMatch(/MAY have been replaced completely/);
    for (const key of JUDGE_CHECKS) expect(prompt).toContain(key);
  });

  it("tells the judge not to hunt for differences from the picture it started from", () => {
    // The product sends the game without a person in the loop, so a hide refused
    // because a bystander moved is a picture thrown away for nothing.
    const prompt = localPatchJudgePrompt("behind-the-fruit-cart");
    expect(prompt).toMatch(/DO NOT hunt for differences/);
    expect(prompt).toMatch(/is NOT a fault and you must not report it/);
    expect(prompt).not.toMatch(/sceneDrift|surroundingsIntact/);
  });

  it("says plainly that being partly hidden is wanted, not a fault", () => {
    // The look the product is after is a child behind a stall or a passer-by.
    expect(localPatchJudgePrompt("behind-the-stall")).toMatch(/partly hidden BEHIND .* is correct and wanted/);
  });

  it("sends three images at SOL LOW and returns the parsed verdict", async () => {
    const sent: RequestInit[] = [];
    const fetchOnce = (async (_url: string, init: RequestInit) => { sent.push(init); return reply(good); }) as unknown as typeof fetch;
    const result = await judgeLocalPatch("test-only", await request(), fetchOnce);
    expect(result.verdict?.verdict).toBe("pass");
    expect(result.requestId).toBe("req-judge");
    const body = JSON.parse(String(sent[0]!.body));
    expect(body.model).toBe(LOCAL_PATCH_JUDGE.model);
    expect(body.reasoning_effort).toBe(LOCAL_PATCH_JUDGE.effort);
    expect(body.messages[0].content.filter((c: { type: string }) => c.type === "image_url")).toHaveLength(3);
  });

  it("carries a failure through rather than softening it", async () => {
    const missing = { ...good, childPresent: "fail", verdict: "fail", reason: "No child matching the portrait is in the picture.",
      faults: [{ check: "childPresent", where: "the sand between the castles is unchanged" }] };
    const result = await judgeLocalPatch("test-only", await request(), (async () => reply(missing)) as unknown as typeof fetch);
    expect(result.verdict?.childPresent).toBe("fail");
    expect(result.verdict?.verdict).toBe("fail");
  });

  it("never turns a truncated or malformed answer into an approval", async () => {
    for (const body of ['{"childPresent":"pass"', "not json at all", { ...good, verdict: "excellent" }]) {
      const result = await judgeLocalPatch("test-only", await request(), (async () => reply(body)) as unknown as typeof fetch);
      expect(result.verdict).toBeNull();
    }
    const failed = await judgeLocalPatch("test-only", await request(), (async () => reply(good, 500)) as unknown as typeof fetch);
    expect(failed.verdict).toBeNull();
  });

  it("refuses an answer carrying a check the product stopped asking about", () => {
    // The schema is strict on purpose: a stale `sceneDrift` in an answer means
    // the prompt and the parser have drifted apart, and a silently ignored key
    // is how a dropped question goes unnoticed for a whole run.
    const parsed = localPatchVerdictSchema.parse(good);
    expect(parsed.pictureWhole).toBe("pass");
    expect(() => localPatchVerdictSchema.parse({ ...good, sceneDrift: "pass" })).toThrow();
    expect(() => localPatchVerdictSchema.parse({ ...good, extra: 1 })).toThrow();
  });

  it("downgrades a failure it cannot point at, and keeps the rest of the answer", async () => {
    // A leftover limb nobody could locate cost a round of argument, so a fail has
    // to carry a place. But discarding the whole judgement over one unnamed field
    // threw away two good hides, so the rule converts instead of rejecting.
    const unlocated = { ...good, pictureWhole: "fail", verdict: "fail", reason: "Something of the old child seems to remain." };
    const result = await judgeLocalPatch("test-only", await request(), (async () => reply(unlocated)) as unknown as typeof fetch);
    expect(result.verdict?.pictureWhole).toBe("unsure");
    expect(result.verdict?.downgraded).toContain("pictureWhole");
    expect(result.verdict?.childPresent).toBe("pass");

    const located = { ...unlocated, faults: [{ check: "pictureWhole", where: "a bare foot beside her left ankle" }] };
    const ok = await judgeLocalPatch("test-only", await request(), (async () => reply(located)) as unknown as typeof fetch);
    expect(ok.verdict?.verdict).toBe("fail");
    expect(ok.verdict?.faults[0]?.where).toMatch(/left ankle/);
  });

  it("never takes the model's own verdict line: a contradictory answer cannot pass", async () => {
    // Answers came back declaring "pass" while saying the child was missing or
    // uncertain. Trusting that line counted them as successes, so the verdict is
    // now derived from the checks every time.
    const cases = [
      { ...good, childPresent: "fail", verdict: "pass", faults: [{ check: "childPresent", where: "no such child on the sand" }] },
      { ...good, childPresent: "unsure", verdict: "pass" },
      { ...good, pictureWhole: "unsure", verdict: "pass" },
      { ...good, styleMatch: "fail", verdict: "pass", faults: [{ check: "styleMatch", where: "her face is smoother than the others" }] },
    ] as const;
    const expected = ["fail", "unsure", "unsure", "fail"];
    for (const [i, body] of cases.entries()) {
      const result = await judgeLocalPatch("test-only", await request(), (async () => reply(body)) as unknown as typeof fetch);
      expect(result.verdict?.verdict).toBe(expected[i]);
      expect(result.verdict?.verdictOverridden).toBe(true);
      expect(result.verdict?.claimedVerdict).toBe("pass");
    }
  });

  it("does not turn a real fail into a pass just because the model said fail", async () => {
    // The override cuts both ways: a declared fail with clean checks is still a
    // pass, but only because every check passed.
    const shy = { ...good, verdict: "fail", reason: "I am not sure enough." };
    const result = await judgeLocalPatch("test-only", await request(), (async () => reply(shy)) as unknown as typeof fetch);
    expect(result.verdict?.verdict).toBe("pass");
    expect(result.verdict?.verdictOverridden).toBe(true);
  });

  it("a described fault beats the field that calls itself pass", async () => {
    // The model has answered both ways in one reply: pictureWhole "pass" beside
    // a fault saying a leg was left behind. The description is the evidence and
    // the field is only the summary, so the summary loses.
    const contradictory = { ...good, verdict: "pass",
      faults: [{ check: "pictureWhole", where: "a bare foot beside her left ankle" }] };
    const result = await judgeLocalPatch("test-only", await request(), (async () => reply(contradictory)) as unknown as typeof fetch);
    expect(result.verdict?.pictureWhole).toBe("unsure");
    expect(result.verdict?.contradicted).toContain("pictureWhole");
    expect(result.verdict?.verdict).toBe("unsure");
    expect(result.verdict?.verdictOverridden).toBe(true);
  });

  it("still passes a clean answer with no faults and no downgrades", async () => {
    const result = await judgeLocalPatch("test-only", await request(), (async () => reply(good)) as unknown as typeof fetch);
    expect(result.verdict?.verdict).toBe("pass");
    expect(result.verdict?.downgraded).toEqual([]);
    expect(result.verdict?.contradicted).toEqual([]);
  });

  it("refuses two of the same child, however well both are drawn", async () => {
    // Re-rendering a hide in a shorter pose box left the earlier standing child
    // above the new mask and painted a kneeling one below it. Nothing was broken
    // and nothing was missing, so every other check passed - and a player would
    // have found her twice, with the second one never clearing.
    const twice = { ...good, childOnlyOnce: "fail", verdict: "pass",
      faults: [{ check: "childOnlyOnce", where: "the same curly-haired girl stands to the left of the one kneeling in the sand" }] };
    const result = await judgeLocalPatch("test-only", await request(), (async () => reply(twice)) as unknown as typeof fetch);
    expect(result.verdict?.verdict).toBe("fail");

    const prompt = localPatchJudgePrompt("sand-strip");
    expect(prompt).toMatch(/EXACTLY ONCE/);
    expect(prompt).toMatch(/two of her is a fail even when both are beautifully drawn/);
  });

  it("tells the judge what pose and what age were asked for, and only when they are known", () => {
    // A kneeling child has no feet on the ground and "the right height" means
    // nothing until you know whether she is four or eight, so both checks are
    // unanswerable without the ask.
    const told = localPatchJudgePrompt("sand-strip", { support: "her knees and shins on the ground", ageYears: 8 });
    expect(told).toMatch(/WHAT WAS ASKED FOR:/);
    expect(told).toMatch(/judge groundContact against THAT/);
    expect(told).toMatch(/8 years old/);

    const silent = localPatchJudgePrompt("sand-strip");
    expect(silent).not.toMatch(/WHAT WAS ASKED FOR:/);
    expect(silent).not.toMatch(/\d+ years old/);
  });

  it("blocks a picture left broken, and only that", async () => {
    // A hand still closed around a hand that is gone is visible to a child, so
    // it refuses. A neighbour who merely moved is not asked about at all any
    // more, so an answer that volunteers one has nowhere to put it and the hide
    // stands.
    const orphaned = { ...good, pictureWhole: "fail", verdict: "pass",
      faults: [{ check: "pictureWhole", where: "the man's hand is still closed around a hand that is no longer there" }] };
    const blocked = await judgeLocalPatch("test-only", await request(), (async () => reply(orphaned)) as unknown as typeof fetch);
    expect(blocked.verdict?.verdict).toBe("fail");

    const moved = { ...good, reason: "The white dog stands a little to the left of where it was, and reads correctly.",
      faults: [{ check: "unspecified", where: "the white dog is further left than in BEFORE" }] };
    const kept = await judgeLocalPatch("test-only", await request(), (async () => reply(moved)) as unknown as typeof fetch);
    expect(kept.verdict?.verdict).toBe("pass");
    expect(kept.verdict?.faults[0]?.where).toMatch(/dog/);
  });
});
