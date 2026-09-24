# Bar surface style and passport completion — local review

## Scope and release status

User approved the **second** dragon-stool style proof, then attached a screenshot to confirm that exact version. Approval covers its art direction, not all 54 appearances or a production release. No paid generation API runner was used; two built-in image-generation edits produced the proofs. No QA deployment, catalog activation or changes to the existing delivered two-world game were made in this pass.

The UI change is local source. A separate local, one-board game exercises the approved third dragon hide, retaining the other two appearances. It has its own game/child IDs and progress. Its private link is in `output/bar-material-review-20260923/local-preview.json`; do not commit that file or the personal art.

## Identity versus paint

Observed defect: the canonical portrait surface is smoother than the board faces. The current portrait-only painter explicitly allows scene influence for clothes/light/depth only; it does not clearly authorize board-matched facial paint. Current age-contract review also treats `styleMatch` and `groundContact` as advisory. These are plausible contributors, not proof that a new prompt alone fixes the whole renderer.

Approved direction: preserve Bar's facial proportions, eye spacing, nose, mouth, hairline and curls. Adapt **surface paint**, warm/cool cheek/forehead/chin planes, grouped hair strokes, local illumination and finish. Never borrow a neighbour's identity, age or facial shapes. No noise overlay or global blur. Scale and floor contact must be judged separately from likeness.

Do not silently rewrite frozen paid recipes/receipts. A future production recipe must have distinct prompt/fingerprint provenance and regression coverage before bulk rendering. Existing game art and all 54 approvals remain unchanged.

## Private art evidence

- `output/bar-material-review-20260923/dragon-stool-style-proof-v1.png`: user rejected facial smoothness.
- `output/bar-material-review-20260923/dragon-stool-style-proof-v2.png`: user-approved reference; SHA256 `b8327c332d9af3cd6d7560ccd0d2a65d7112794965c71900faa48d48ce441e2c`.
- `intake-candidate.png`: normalized to 512×768, passed through existing bounded local-patch composition; not a replacement for the source master.
- `intake-report.json`: aligned, shift (0,0), mean boundary difference 8.96, bounded fade recommended. This is a boundary check, not an automatic identity/style approval.
- Third hide geometry remeasured for this local proof: x=88, y=77, w=172, h=510, head=(153,161). Original geometry and approved source manifests were not overwritten.
- Reproduction helpers are local `tmp/probe-approved-style.ts` and `tmp/create-bar-style-preview.ts`; the latter refuses non-local/mock-disabled-generation environments and an existing preview ID.

## Passport completion

Claude's ceremony/stamp work is already on this branch. The separate completion dialog still looked like a generic card; this was not a missing merge. Claude's latest `44a69c43` child-page redesign is unrelated and has not been merged here.

- Shared passport material tokens, navy binding, paper edge stack, two paper leaves and central crease on desktop.
- One compact paper page on phones, with smaller collected items and height-aware photo sizing.
- Opening motion plus existing immediate colour, stamp impact/audio and reduced-motion/mute semantics.
- Unchanged account-save acknowledgements, offline messages, guest progress and navigation behavior.

## Verification

- TypeScript check passed.
- Seven passport/album/navigation component suites: **42 passed**.
- New markup regression asserts two numbered leaves, six discovery slots, accessible heading and decorative folios.
- Real pointer walk in the local castle board, then the separate dragon proof: 6/6 items and 3/3 personal finds each; no injected progress/store events.
- Dragon proof final CSS: 1440×900, 1366×768, 390×844, 360×740, 360×640: zero document **and dialog** overflow; main buttons ≥64px high, passport link 48px; no browser JS errors.
- Screenshots: `tmp/dragon-finale-<width>x<height>.png`. A preliminary castle laptop measurement found 6px of dialog scroll; the short-height desktop rule fixed it before the final dragon measurements above.

## Independent Claude challenge / next pass

1. Inspect the final five screenshots and replay completion with no items, long English labels, reduced motion, mute, delayed/failed save and the final board. Confirm no text/controls clipped at 360×640.
2. Confirm changes reuse existing passport material/stamp rather than regress Claude's book work.
3. Check the approved face at native scale **in context**, stool overlap, feet and relative size; distinguish art approval from border diagnostics.
4. Design a versioned painter contract that separates identity from surface finish and tests paid-retry provenance. Do not mass-render or retroactively approve 54 appearances from this one example.
5. Remaining: carry approved style through other appearances, publish reviewed assets through normal receipts/configuration, and only then deploy a clean committed release to QA. This pass does not close those items.

## Exact approved edit prompt

Use case: identity-preserve, precise local painterly edit. Image 1 is the EDIT TARGET: the portrait-format dragon nursery crop with the curly-haired boy in an orange shirt, apron and boots correctly grounded to the right of the stool. Image 2 is STYLE EVIDENCE ONLY: the wide original board, especially the dimensional faces of the girl to his left and children feeding the dragon. Do not copy any of their identity features.
Change ONLY the surface painting of the central curly-haired boy's skin and hair in Image 1. Preserve his exact face shape, eye size/spacing, nose, mouth, characteristic curls, age, expression, pose, body size, clothes, shoes and floor placement. Preserve ALL surrounding image geometry, people, stool, scale, dragons and background. Same exact framing and aspect ratio as Image 1.
His face is still too smooth, uniformly orange and vector-like compared with the board. Actually repaint the skin using the same visibly modelled gouache/oil-storybook brush technique as the surrounding children: multiple distinct but softly joined warm/cool painted planes on forehead, temples, cheekbones, nose sides, lower cheeks and chin; reflected golden cave light on lit planes, cooler muted olive/umber halftones and occlusion under fringe, nose and chin. Small purposeful irregular opaque brush marks build the anatomical form. Broken brushed highlights, not glossy dots. Brush transitions should be visibly present at the same scale as adjacent faces, not microscopic noise. Eyes remain clear but not oversized glossy doll eyes. Retain curls but integrate them through irregular grouped painted dark/light locks, not uniformly outlined coils.
This is NOT merely more contrast or added grain: eliminate large untouched flat/smooth skin fields while keeping a clean readable happy young face. No airbrush gradients, cel-shaded flat orange fill, plastic skin, pores, freckles added as texture, stippling/noise filters, over-sharpening or all-over scratchy lines. No photorealism. No copied neighbour face. Do NOT repaint the full crop or add objects. Return only the edited Image 1.
