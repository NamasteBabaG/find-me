# Expanded adventure — saved and paused for board feedback

Parent explicitly requested a pause of child placement and a clean-board review before continuing. No further paid generation, expanded-game creation, deployment or replacement is authorized until that review is resolved.

## Review surface

`http://localhost:3017/reviews/adventure-expansion-20260914.html` shows the three family-tested bases followed by six proposed companion boards, numbered 1–9. Each links to its full 3840×2160 master. No Bar patch is shown. The six new boards are proposals, NOT parent-approved artwork. Structural `ready` in their authoring JSON means bytes and geometry can be validated, not visual approval or activation.

## Preserved work

- Branch: `codex/adventure-three-boards-20260914`, isolated worktree `work/adventure-three-boards-20260914`.
- Existing game `game_adventure_bar_three_v1` and its progress were not modified. No expanded game was created.
- Six new lossless 4K masters and thumbnails are under `public/scenes/adventure-{paris,marrakech,tokyo,greatwall,sydney,antarctica}-v1/`.
- Original attempts, selected v2 proposals, prompts and reference remain locally under `output/imagegen/adventure-expansion-20260914-v1/`. CLI fallback was used with the parent's existing key, `gpt-image-2`, high quality, native 3840×2160. Ten successful base calls total: six initial images and four style corrections. Two initial WebP-input requests returned HTTP 400 without generating an image; lossless PNG reference fixed MIME handling. Base API billing was not exposed by the CLI; no exact base-cost claim is made.
- Item/crop/placement authoring is in `content/adventures/expansion/`. These are provisional and must be re-authored/revalidated if a base changes. Do not carry coordinates or patches across changed board pixels.
- Private identity and retained personal attempts remain in `storage/adventure-bar-20260914/` and `storage/adventure-bar-expansion-20260914/`; never commit those personal media or key material.
- Already-started personal jobs had finished when the pause was checked. There are no active expansion renderer processes and no unresolved/reserved purchase requests. Twenty-three personal attempts were retained (18 initial new-board hides, 3 Amazon-size attempts, 2 selected repairs). Personal settled cost: $0.496372, excluding base boards. Existing canonical identity was reused with zero identity purchases. Technical acceptance is not final visual approval.
- Amazon size attempt 3 passed the unmodified technical gate after two refused shifted-border attempts. It is somewhat taller than the prior shipped crouch; a parent visual scale review is still needed. Do not claim the user's concern is conclusively resolved yet.
- First attempts for Sydney 1/3 and Antarctica 1/2 were technically refused. They were retained and NOT repaired after the pause. Other unreviewed patches also remain unapproved. No final review seal exists for expansion.

## Safe resume

1. Collect feedback on the numbered clean boards first. Preserve the originals and explicit art selections.
2. Only after the parent asks to resume, remove the explicit `content/adventures/expansion/review-status.json` pause gate. The personal runner fails before API work while this file exists.
3. Resolve art/difficulty issues and validate all 36 new item crops at native size. Rarity and actual difficulty are independent; several epic-shaped souvenirs rendered visibly and should not be described as genuinely hard without adjustment/review.
4. Reuse only source-matching retained patches; inspect face likeness, age, body support, scale and seams individually. No bypass of technical refusals or automatic paid retry loops.
5. Seal actual sprite geometry and hashes before assembling a distinct, new game. Do not modify the existing three-board game.
6. Complete asset/content/type/test/build and browser checks. Four new expansion regression tests and type-check passed before the pause; full expanded-game/browser verification is NOT complete.

The new generic assembly supports a nine-node serpentine map but is not wired into production creation. Existing three-board defaults remain supported. Prompt-authoring source: `scripts/prepare-adventure-expansion-prompts.ts` and `scripts/prepare-adventure-style-followup.ts`; mapping source: `scripts/author-adventure-expansion.ts`.
