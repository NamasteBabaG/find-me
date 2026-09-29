# Scene integration and creation UI — QA release

New wizard purchases select content version 12 with the same nine hash-bound current masters, 27 hides and 54 discoveries. Existing version 11 purchases retain their original rendering and review receipts.

Version 12 separates facial identity/age from rendering surface. The canonical reference uses a painted geometry-preserving recipe, and identity approval requires explicit identity, age and painted-style passes. Local rendering uses medium quality and a smaller portrait reference; the independent judge retains the full portrait.

Publication requires explicit passes for scene style, local lighting and intact neighbouring anatomy, in addition to identity, age, completeness, scale, support and seams. Each board review receives 20 bound images, including four registered before/after quadrant pairs per hide. A model summary cannot override a missing, contradictory or located failed check. Version 12 accepts enough fault entries to describe every failed check without losing the diagnosis.

After two concluded failures, durable recovery compares the original board, paid raw results and actual shipping pixels. It can change placement, recompose a suitable retained result or repaint only the existing target's surface. Surface repair uses the existing target as its locator and is unavailable for structural/identity/neighbour damage. Every new candidate still requires independent review. Historical receipts, spending limits and request idempotency remain enforced.

Creation/ready screens now show a genuinely circular portrait, one portrait per screen, a plain progress bar and state-appropriate primary heading. Checkout removes repeated summaries, separates child/age and world information, keeps payment status text visible and fits mobile/RTL layouts.

Validation before this commit:

- Full `npm run check`: 286 files, 3,659 passed, 2 expected failures, 55 skipped.
- Final parser tests: 52 passed, including all 13 simultaneous located failures; final creation tests: 9 passed. Typecheck passed after these changes.
- Scene and adventure validators passed, including the version 12 catalogue.
- Actual components rendered for desktop and 390px mobile, English and Hebrew. The local visual fixtures use synthetic status/checkout data; this is not evidence of a deployed owner session.
- Real provider audit of the current 27 appearances found style mismatches and multiple damaged neighbours. The new judge accepted an untouched-master style/anatomy control while rejecting its missing identity.
- Real recovery of the Tokyo pastry-stall hide passed style, lighting, identity/age and neighbouring anatomy. The first new production renders for Marrakech hides 1 and 2 also passed. The fountain hide was independently refused for neighbour damage and entered diagnosis.

At commit time the current delivered game is unchanged. Other private repair candidates remain under review; code tests and a technical composition pass do not establish visual acceptance. The original photograph has already expired under retention, so this incident's likeness reviews use the approved canonical identity. Private images, provider responses, retained paid ledgers and screenshots stay outside the release source.
