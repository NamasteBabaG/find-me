# Castle item repair — failed acceptance, preserve v14

## Authoritative art

User-approved castle remains `output/imagegen/magic-castlegate-v14-royal-identity.png`. Do not replace runtime or QA art with v15/v16. Neither is gameplay-ready.

## Work performed

Before rendering, inspected game HUD/collection CSS, visually inspected v14, and authored a spatial item plan in `MAGIC_CASTLEGATE_V15_ITEM_PLAN_20260916.md`. Selected interior landmarks, sizes and removal instructions for old targets. Two bundled CLI API edits (gpt-image-2/high/3840x2160) were executed with authorized existing key. Exact prompts are in `docs/art/magic-castlegate-v15-interior-items.prompt.txt` and `docs/art/magic-castlegate-v16-two-item-fixes.prompt.txt`. CLI reported 123.8s and 122.0s respectively; no supplier price receipt available.

## Rejection evidence

- v15 moved visible targets inward and removed the old outer copies, but duplicated the moon brooch on the king and toy maker, and left the bell without convincing physical support. A follow-up targeted only these defects.
- v16 removed the toy maker's duplicate brooch but duplicated the copper bell instead: one beside the dragon tail and another near its face. The original unsupported bell persisted.
- Native-size inspection revealed malformed wooden dragon anatomy on the puppet stage, with a head-like extra tail form. Not an acceptable clear target for children.
- v16 also visibly degraded source preservation with overlapping/ghosted detail across areas of the picture. Reject the whole candidate even if some targets individually read well.
- Feather, key and map can be identified in close crops; this does not make the full six-item board acceptable or gameplay-ready. Requested placement is not proof of successful placement.

Two attempts exhausted the creative-production retry limit. No further paid calls in this turn. No changes to application code, catalog, hotspots, QA, Git remote, Claude worktree or personal hides. PNGs and inspection crops retained under ignored `output/imagegen/` for diagnostic evidence; not remotely backed up.

## Next method (not executed)

Restart from approved v14, not degraded v16. Use tightly bounded masked/local image edits for target removal and insertion, inspect each at native resolution, then validate all six unique shapes and context. Preserve non-edited scene pixels as an explicit criterion. Only measure gameplay rectangles from a passed final image. Verify actual mobile camera/HUD behavior separately; static inner-region coordinates are not sufficient to claim universal UI safety.
