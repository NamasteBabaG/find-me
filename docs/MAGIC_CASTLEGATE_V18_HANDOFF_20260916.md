# Castle v18 — fresh master and six authored discoveries

## Decision and source

The user authorized enriching the board and selecting actual good rendered objects, rather than forcing the previous six-object list. During v17 they explicitly flagged edit-induced smearing and authorized a fresh render. v17 is rejected and must not be shipped.

v18 is a new composition generated with v14 as a style/theme reference, not another pass over v17/v16. Because a reference image was supplied, the bundled CLI used the Images API edit endpoint; the prompt explicitly requested a fresh drawing. Do not describe it as a text-only generation endpoint call. Exact prompt: `art/magic-castlegate-v18-fresh-master.prompt.txt`. One gpt-image-2/high invocation, 153.2 seconds; supplier cost receipt unavailable. Earlier v17 invocation took 131.5 seconds and is not a delivered asset.

- PNG: `output/imagegen/magic-castlegate-v18-fresh-master.png`.
- Native output: 3840x2160, no upscale.
- PNG SHA256: `81d875c789ccc846bd61ae27b6964f5460545d8664460e004fbab574c092e9a9`.
- Packaged board: `public/scenes/magic-castlegate-v18/base.webp`.
- WebP SHA256: `822c8ae9a2d7fe325685feb97702349e29a74f56d73c6f45b8135aac8876b55a`.
- Lossless decoded-pixel comparison with source PNG passed.

## Visual acceptance

Full-board and native-size crops inspected. Faces, hands, outlines, hourglass glass/sand, teapot, carved duck, puppet costume, frog and dog ribbon are resolved without the ghosted/smeared failure seen in v16/v17. New staging retains a shallow crowded royal courtyard, guards, red carpet, ivy, musicians, knights, puppets, cupcake table, toy workshops and playful children. Source people/arrangement were not pixel-preserved: user authorized a fresh render. Rendered sand is purple, not the blue requested; the item is called simply 'hourglass'. No claim that every prompt detail was followed.

## Final object selection (supersedes v12/v15 lists)

| ID | Hebrew name | Rarity | Location |
|---|---|---|---|
| purple-teapot | קנקן סגול | common | royal cupcake table |
| sand-hourglass | שעון חול | common | gatekeeper desk |
| yellow-duck | ברווז עץ | common | puppet theatre |
| ivy-frog | צפרדע בעציץ | rare | ivy pot near knight circle |
| knight-puppet | בובת אביר | rare | puppet theatre, beside duck |
| dog-blue-ribbon | הסרט הכחול של הכלב | epic | golden dog's collar knot |

Each selected target visually identified in context and in exported card crops. Duck and puppet share a story pocket but have separate, non-overlapping hit areas. Their large visible silhouettes can have adjacent bounding rectangles; only the hits define selection. Closed red books were excluded because they repeat. The bottom spinning top/scissors and left-edge ornaments remain scenery, not targets. The blue ribbon specifically means the bow on the dog, not any blue cloth in the board.

## Authoring and validation

`scripts/author-castlegate-v18.ts` contains measured native-pixel visible/hit/card rectangles, Hebrew/English names, hints, story copy, and rarity/difficulty. Exports source-pixel crops (no new icon rendering) to `output/imagegen/magic-castlegate-v18-authoring/`. `public/scenes/magic-castlegate-v18/discoveries.draft.json` is bound to the packaged WebP hash; retains source PNG hash.

Passed: source dimensions, real `DiscoverySchema`, unique IDs, hit-inside-visible and visible-inside-card constraints, nonoverlapping hit areas, 3/2/1 rarity counts, static interior bounds x24%-83% and y24%-71%, lossless packaging. These bounds keep the selected targets away from image edges; they are NOT evidence of all-device HUD clearance. Difficulty is an authored initial judgment, not child-playtest evidence.

## Remaining release work, not silently claimed done

Real-game mobile/desktop pan/zoom/HUD and touch checks, personal hiding zones protected against these new discovery crops, and runtime catalog/release integration. No personalized child rendering, app/wizard changes, DB mutation, QA deployment or remote push. Do not reuse prior-version coordinates. New assets are in a versionable public directory but have not been committed/pushed in this turn. v14 and rejected candidates retained for comparison.
