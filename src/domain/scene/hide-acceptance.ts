import { z } from "zod";

/**
 * Who accepted a hide, and for which picture.
 *
 * Three different facts kept collapsing into one word. The provider's answer,
 * the code's derived verdict, and a person saying "that one is fine" were all
 * written as `verdict: "pass"`, and once they were, none of them could be
 * recovered: the product owner's decision on two boards looked exactly like a
 * model approval, so nobody could tell how often the judge was actually right,
 * and nobody could see which pictures a person had ever looked at.
 *
 * So a decision is a record of its own, and it is BOUND TO A PICTURE. A person
 * approving one render is not approving the next one at that spot: re-render a
 * hide and the old approval simply does not apply, which is the whole point of
 * carrying the hash.
 */

export const HideDecisionSchema = z.object({
  hide: z.string().min(1),
  /** The picture this decision is about. A decision does not travel to another. */
  imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
  decidedBy: z.enum(["human"]),
  decision: z.enum(["accept", "reject"]),
  /** Why, in the decider's own words. An approval nobody explained teaches nothing. */
  reason: z.string().trim().min(1).max(400),
  decidedAt: z.string().datetime(),
}).strict();
export type HideDecision = z.infer<typeof HideDecisionSchema>;

export type ModelVerdict = "pass" | "fail" | "unsure" | "none";

/**
 * What the judge said, and WHICH PICTURE it said it about.
 *
 * The hash is not decoration. A human decision was bound to a picture from the
 * start, so changing the art retired it - but the machine verdict travelled as a
 * bare word, and a hide whose pixels had changed kept the approval the judge had
 * given the picture before it. The two have to be bound the same way or the
 * looser one decides.
 */
export type MachineJudgement = {
  readonly verdict: ModelVerdict;
  readonly imageSha256: string;
};

export type Acceptance = {
  readonly accepted: boolean;
  /** `human` only when a person's decision is what settled it. */
  readonly by: "model" | "human" | "nobody";
  readonly reason: string;
};

/**
 * What a hide's standing actually is, given what the judge said and what a
 * person decided about THIS picture.
 *
 * A person overrules the judge in both directions: they may keep a picture the
 * judge refused, and they may refuse one it passed. What they may not do is
 * disappear - the model's verdict stays beside their decision, because that is
 * the only way to find out later whether the judge is worth its cost.
 */
export function effectiveAcceptance(
  machine: MachineJudgement,
  imageSha256: string,
  decisions: readonly HideDecision[] = [],
): Acceptance {
  // Only decisions about the picture in hand count. The newest wins, so a person
  // may change their mind without the record losing the earlier view.
  const mine = decisions
    .filter(d => d.imageSha256 === imageSha256)
    .slice()
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
  const latest = mine[mine.length - 1];
  if (latest) {
    return {
      accepted: latest.decision === "accept",
      by: "human",
      reason: `${latest.decision === "accept" ? "kept" : "refused"} by a person: ${latest.reason}`,
    };
  }
  // The judge's answer is about the picture it was shown. If that is not the
  // picture in hand, it says nothing about this one - not even a refusal, since
  // a new render deserves its own look rather than inheriting an old rejection.
  if (machine.imageSha256 !== imageSha256) {
    return { accepted: false, by: "nobody", reason: "the judge's answer was about a different picture, and nobody has looked at this one" };
  }
  if (machine.verdict === "pass") return { accepted: true, by: "model", reason: "the judge passed it and nobody has looked" };
  return { accepted: false, by: "nobody", reason: `the judge answered ${machine.verdict} and nobody has decided` };
}
