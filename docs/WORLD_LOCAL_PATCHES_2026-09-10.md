# The local-patch world — 10 September 2026

Nine boards, twenty-seven hides, every one of them bought and looked at. This is
what the engine is, what it refuses, and what is still not wired.

## What a hide is

The boards are painted once. What is rendered per child is a **crop of the
board** — 512×768 — handed to the painter whole, with a mask over it, and pasted
back whole.

```
crop   512×768 of the board                      cropOf(hide)
mask   the pose's box, sitting on the ground line maskOf(hide)
```

Two paid renders settled why it has to be a whole crop: **the painter redraws
everything it is given.** Prose ("change nothing else") did not stop it, and an
edit mask did not either — the masked attempt strayed slightly *more* than the
unmasked one. So the board is not preserved by asking. It is preserved by taking
back only the crop rectangle and leaving every pixel outside it alone, which
makes the choice of rectangle the whole game.

The placements live in `src/domain/scene/local-patch-hides.ts` because they are
the expensive half: a render is a few cents to redo, and a placement cost paid
attempts to find. Nothing in that file is an image — a placement is a rectangle,
a pose and a board — so it carries no child's likeness and never can.

### The collision rule

Two hides on one board may not sit so close that one hide's **crop** contains the
other's **mask**. The sprite for a hide is cut from the finished board at its crop
rectangle, so a crop that reaches into where the other child was painted carries
her inside it, and the player finds her twice — once where she belongs and once
as a passenger. `assertPlaceable()` throws on it; the crops themselves may touch.

## What the painter is told

`src/services/generation/local-patch-prompt.ts`. Every clause is there because a
paid render went wrong without it:

| clause | what it cost to learn |
| --- | --- |
| the drawing clauses | first results were photographic faces pasted into a painting |
| **two ways to fit her in** | every refusal on 10 September came from the painter deciding to erase a neighbour and doing it badly. It had never been told it could simply put her *beside* them |
| **her age** | a child of eight came back looking four. The painter matches whoever is nearest, and on these boards the nearest is usually a toddler |
| **her pose** | without one, all twenty-seven appearances are the same picture: a child standing, facing the reader |

The age comes from `childAgeDirection()` — the parent's stated age, never guessed,
and never silently made eight when it is unknown.

### Poses

Five, and each needs nothing of its spot but ground and a neighbour — a pose that
needs a wall or a bench is wrong wherever there is not one, and a board is
authored before anyone looks again.

| pose | mask box |
| --- | --- |
| standing | 252×500 |
| peeking | 252×500 |
| kneeling | 260×380 |
| crouching | 268×330 |
| sitting-cross-legged | 284×300 |

Lower poses are shorter and wider, and **every box ends on the same ground
line** — the bottom edge a standing child's feet would have reached — because
that line is what makes her belong to the depth she is drawn at. A standing-height
box around a kneeling child either leaves her floating in it or invites the
painter to stand her up.

## What the judge refuses

`src/services/generation/local-patch-judge.ts` — SOL at LOW, three images
(before, after, the identity reference), one judgement per hide.

Six checks. Three block: `childPresent`, `childComplete`, `pictureWhole`.

**The verdict is always derived, never taken from the model's own summary line.**
Answers came back declaring "pass" while saying the child was missing. A failure
the model cannot point at is downgraded to `unsure` — and an `unsure` is not an
approval, because a located-fault rule that only downgraded quietly turned every
unlocated failure into a clean sheet.

### What it deliberately does *not* ask

Whether the picture still matches the one it started from.

An earlier version compared AFTER against BEFORE and refused a hide whenever a
bystander had moved, vanished or been repainted. That refused good pictures: a dog
a hand-span to the left, a cat that shifted, two children gone from a crowd of
forty. **Nobody plays the BEFORE.** The game is generated and sent without a person
in the loop, so a judge that holds out for an unchanged neighbourhood does not
protect a player from anything — it throws away pictures that look right.

What still refuses is the picture itself being broken: a body with no head, a hand
closed around nothing, a bucket floating where its owner stood, a hard rectangular
edge across the paving. Those are visible without the BEFORE, and a child would
see them.

Being **partly hidden** behind something in front of her is correct and wanted, not
a fault. Two of the accepted hides pass with their feet out of sight.

`scaleRight` and `groundContact` cannot be answered without knowing what was asked
for — a kneeling child has no feet on the ground, and "the right height" means
nothing until you know whether she is four or eight — so the caller passes the
pose's support wording and the stated age.

## What the rounds cost

| round | hides | outcome |
| --- | --- | --- |
| sydney (three-attempts) | 3 | 3 accepted |
| antarctica, giza, tokyo (three-boards) | 9 | 9 accepted |
| amazon…paris (world-local-patches) | 15 | 10 accepted, 5 refused |
| refill, new places + the relaxed judge | 5 | **5 accepted**, one second attempt |
| poses | 3 | see `work/world-poses-20260910/poses.json` |

A hide costs about **4.9c to render and 1.7c to judge**. A world of 27 is roughly
**$1.80** at one attempt each.

### The refusals, and what they were really about

All five on 10 September said the same thing in different words: a person or an
animal stood inside the masked rectangle, the painter tried to move them out of
the way, and left a piece behind — a headless striped torso, purple trousers under
her feet, a dog shifted sideways, a boy's hands with no boy.

Gradient scoring cannot find places without people in them, and it was tried: on
the market board its three best rectangles covered a seated boy, a donkey and a
girl in a headscarf. Paint tells you a rug is busy and says nothing about who is
standing on it. Asking the observer for people-free cells found **11 cells on
marrakech, 2 on newyork, 1 on tokyo** — on a hidden-object board there is no empty
ground, and there is not supposed to be. So the fix was never a better site
search. It was telling the painter it could stand her *beside* them.

**Every attempt is now written to disk before it is judged.** Four refusals in the
earlier round left no image behind, so nobody could check whether the judge had
been right — and that is exactly the check that matters when the game is generated
and sent with nobody looking.

## Playing it

The world is built into the shape the gated dev route already serves, so it opens
in the **real player**, not in a viewer written for it:

```bash
npx tsx work/board-conditioned-engine-20260909/assemble-world.ts
npx tsx work/board-conditioned-engine-20260909/build-world-game.ts --out=work/private-game-world-20260910 --manifests=work/world-final-20260910/manifest.json
```

Then, with `PRIVATE_REVIEW_DIR=work/private-game-world-20260910` set, sign in as an
admin and open `/dev/private-review`.

These are a real child's illustrated appearances. They live under `work/`, which is
gitignored, and are served only by the admin-gated dev route, which 404s on the live
shop. **They are not deployed, and must not be:** the QA box answers anyone who has
the link.

## What is NOT wired

`local-patch-seam` and `local-patch-judge` are libraries; **nothing in
`runGenerationPipeline` calls them.** The QA deployment does not run this engine —
it runs the board-conditioned slot-patch pipeline. Turning the 27 placements into a
generated game for an uploaded photo is the next piece of work, and it needs: a
pipeline stage that walks `WORLD_LOCAL_PATCH_HIDES`, the ledger around each render,
evidence retention per attempt, and the sprite geometry (`rect` / `hitRect` /
`anchor`) written through `src/services/generation/patch.ts` rather than beside it.
