# Scene integration and creation UI — QA release

New wizard purchases select content version 12 with the same nine hash-bound current masters, 27 hides and 54 discoveries. Existing version 11 purchases retain their original rendering and review receipts.

Version 12 separates facial identity/age from rendering surface. The canonical reference uses a painted geometry-preserving recipe, and identity approval requires explicit identity, age and painted-style passes. Local rendering uses medium quality and a smaller portrait reference; the independent judge retains the full portrait.

Publication requires explicit passes for scene style, local lighting and intact neighbouring anatomy, in addition to identity, age, completeness, scale, support and seams. Each board review receives 20 bound images, including four registered before/after quadrant pairs per hide. A model summary cannot override a missing, contradictory or located failed check. Version 12 accepts enough fault entries to describe every failed check without losing the diagnosis.

After two concluded failures, durable recovery compares the original board, paid raw results and actual shipping pixels. It can change placement, recompose a suitable retained result or repaint only the existing target's surface. Surface repair uses the existing target as its locator and is unavailable for structural/identity/neighbour damage. Every new candidate still requires independent review. Historical receipts, spending limits and request idempotency remain enforced.

Creation/ready screens now show a genuinely circular portrait, one portrait per screen, a plain progress bar and state-appropriate primary heading. Checkout removes repeated summaries, separates child/age and world information, keeps payment status text visible and fits mobile/RTL layouts.

Validation before this commit:

- Final full `npm run check`: 286 files, 3,662 passed, 2 expected failures, 55 skipped.
- Final parser tests: 52 passed, including all 13 simultaneous located failures; final creation tests: 9 passed. Typecheck passed after these changes.
- Scene and adventure validators passed, including the version 12 catalogue.
- Actual components rendered for desktop and 390px mobile, English and Hebrew. The local visual fixtures use synthetic status/checkout data; this is not evidence of a deployed owner session.
- Real provider audit of the current 27 appearances found style mismatches and multiple damaged neighbours. The new judge accepted an untouched-master style/anatomy control while rejecting its missing identity.
- Real recovery of the Tokyo pastry-stall hide passed style, lighting, identity/age and neighbouring anatomy. The first new production renders for Marrakech hides 1 and 2 also passed. The fountain hide was independently refused for neighbour damage and entered diagnosis.

At commit time the current delivered game is unchanged. Other private repair candidates remain under review; code tests and a technical composition pass do not establish visual acceptance. The original photograph has already expired under retention, so this incident's likeness reviews use the approved canonical identity. Private images, provider responses, retained paid ledgers and screenshots stay outside the release source.

The real run also exposed otherwise valid plans whose explanation exceeded 800 characters. The parser now bounds that non-executable prose without relaxing numeric geometry or action validation, and the prompt requests a concise explanation. A separate bounded engineering validation follows this correction; both research ledgers remain retained. Production world allowances are unchanged.

## QA deployment and incident repair outcome

Commit `e88a1ea900f6e261d6e44f8c8fa3905b3f80601f` passed GitHub Actions run `36570863840`, the clean build and the private-source audit. Deployment `dpl_2rFHsip9dXX1XBgQwpPJ5AdrYtQP` was promoted to the dedicated QA alias.

Nineteen replacement images passed the independent, byte-bound review and manual inspection. They were published to the existing delivered QA game in one fenced transaction, including target geometry, scene configurations and the saved passport. All nine boards and 27 hides remain. Database verification confirmed 19 replaced assets, the expected configuration digest, an identical game/passport image book, and preservation of all 18 existing finds and discovery progress. The prior configuration, progress and replaced assets remain recoverable through the incident audit.

The replacements cover all hides in New York, the Amazon, Paris, Marrakech and Antarctica, plus Tokyo hides 1 and 3 and Sydney hides 1 and 2. This includes the Marrakech fountain and Tokyo pastry-stall defects reported in the screenshots. Eight images remain unchanged and unresolved: all three in Giza, all three at the Great Wall, Tokyo hide 2 and Sydney hide 3. This is a partial repair, not evidence that the whole game or a fresh 27-hide purchase meets the requested visual quality.

A private head-only repaint experiment was excluded from the release: manual inspection found a clipped neighbouring face despite a model pass. Its code was reverted and its candidate was not published. The judge's explicit checks improve detection but do not establish perfect anatomical detection. No failed candidate was manually marked as a passing model result.

The two retained engineering repair ledgers settled approximately USD 4.76 and USD 4.85 respectively, separate from the original game's charges and earlier audit/reference experiments. Further paid loops stopped at the remaining reservation allowance or the bounded round limit. Imported assets do not represent free image generation; their original engineering receipts remain in the retained private ledgers.

Live QA inspection verified the ready layout through an existing owned test game. That older game has no linked child profile; the page now falls back to its validated published child name. The available browser account does not own the incident game, so database/asset evidence must not be represented as a completed owner-session playthrough of that game.
