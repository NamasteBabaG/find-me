# Public beach demo and presentation artwork

Status: original release deployed to QA at commit 15fcd15; follow-up foot-occlusion and compact HUD fixes verified locally and queued for QA. Claude f2ec829 remains preserved in history.

## Generation provenance

Existing public example girl: `public/demo/example-photo.jpg`; age 8 is the existing demo's test parameter. No family/private child files used.

Base: bundled imagegen CLI, GPT Image 2, high, 3840×2160; Giza shared base is a style-only reference. Prompts: `DEMO_BEACH_2026-09-15.prompt.txt` and `DEMO_BEACH_ITEMS_2026-09-15.prompt.txt`. First API attempt was HTTP 400 (WebP MIME reported as octet-stream); PNG encoding was used without changing the reference pixels. One successful base plus an explicit object-difficulty pass.

Identity and hides: production `OpenAiAvatarProvider` and v9 local-patch painter, retained-purchase ledger, medium, one attempt per operation, isolated $2 ceiling. Visual review is separate from technical acceptance.

### Reconciled local preflight failure

`public-demo-beach-20260915-v1/identity:1` was incorrectly marked unknown by the generic capture wrapper after `createCharacter` rejected the 300×420 style crop. It never reached fetch. Reproduced offline using the identical style/photo/contract and a counting fetch stub: `dispatches: 0`, `CHARACTER_STYLE: the verified atlas must be one unrotated1024-square PNG`. No provider charge/result exists for that local validation failure. Its SQLite ledger is preserved, not deleted or reset. The corrected 1024-square atlas is a distinct pinned input in `public-demo-beach-20260915-v2`, with metadata checked before reserving.

## Compatibility

Home first-world artwork resolves approved density boards. Old saved games keep their own bases, patch geometry and postcard recipes. Nine presentation thumbnails are rebuilt from hash-checked shared masters. Customer assets are never used in marketing.

Public demo images are content-addressed under `/demo/beach-v1/<sha256>.webp`. Only that strict namespace is allowed in album bindings alongside existing `/api/assets/<id>` references. No arbitrary public paths are accepted.

## Released content and review

- Native base: 3840×2160, SHA-256 `e5c2f0e04ef36aed55e3f96c3a9f234bfb87ef2b4da6e5f02420e9cea0c561c3`.
- Three serial hiding places: sandcastle, beach map/library, shell necklaces. Exactly one personalised child appears at a time, using the real v9 patch compositor.
- Six finds: blue wooden fish, anchor bucket and star mould (common); purple paper boat and brass compass (rare); turquoise seahorse pendant (epic). Hit regions and sticker crops bind to the published master.
- The first two library patches were rejected because they damaged the nearby guitarist. The third uses a relocated crop and preserves the surrounding people. Only the three accepted final patches were published; rejected intermediates remain private under ignored storage.
- Identity and five patch attempts settled at 236,205 micro-USD ($0.236205) in the isolated v2 ledger, with no reserved/pending/unknown operations remaining. This excludes the separate base-image CLI calls and is not the total project spend.
- Public release gates include source/identity/patch SHA checks, technical acceptance and a separate visual-review record. No customer assets or API credentials are published.

## Gameplay and frame behaviour

The embedded demo uses the same scene player, hint ladder, star flight, discovery tray and completion/replay flow as the game. It starts directly inside one board, has no map, bag or next-board navigation, and makes no storage/account/telemetry writes. Replay starts a fresh three-hide/six-discovery visit. No saved-album claims are shown in demo feedback.

UI dimensions respond to the embedded frame, including compact collection mode, contained sheets and bounded completion cards. The shared viewport clamps every animation frame and all pan gestures to the image boundaries; the old desktop overscroll allowance is removed for real games too. Fit-to-frame letterboxing remains centred rather than pannable.

## Verification

- `npm run check -- --maxWorkers=2`: 230 files passed; 3,225 passed, 2 expected failures, 35 skipped (3,262 total). Concurrency is capped to avoid resource contention with the active dev server.
- Both scene/adventure validators passed (existing legacy-slot warnings retained).
- Live localhost demo: three serial child finds, collectible acquisition, completion, replay to 0/3 stars and 0/6 discoveries; no board-navigation controls.
- Desktop pan tested at both extremes after zoom: all image edges clamp to the viewport. Automated viewport checks cover desktop, tablet, portrait, landscape and embedded-frame sizes, including animated focus/reset.
- Portrait collection sheet and 844×390 landscape collection + two-stage item hint inspected in-browser. Landscape hint bounds stayed inside the 781×330 demo frame.
- Existing legacy demo fixture tests explicitly keep legacy sequential semantics rather than silently inheriting the new beach find-any configuration. Real-viewport test observers now identify the viewport node, not whichever ResizeObserver happened to be constructed last.

QA delivery is recorded in the shared coordination note `docs/CODEX_DEMO_ART_2026-09-15.md` in the main checkout. No database migration or production activation is part of this change.

## Follow-up: foot occlusion and English/RTL HUD

- The library sandal originally appeared on top of the book crate. A single successful GPT Image 2 high-quality masked CLI edit now puts the books in front of the feet. Prompt: `DEMO_BEACH_FOOT_REPAIR_2026-09-15.prompt.txt`; preparation/composition: `scripts/repair-public-demo-foot.ts`. This separate CLI call is not included in the v2 provider ledger cost above.
- Only local pixels x=152..259, y=600..714 in the 512×768 patch can change. Full patch and enlarged detail were visually reviewed; a regression test compares decoded old/new public assets and enforces zero changed pixels elsewhere (including face, hair and bystanders). The old immutable URL is retained. The new library asset is `a6aa81b4567045648b015442967a8c779459f069014a1feece157c49783203dc.webp`. Its hit area ends at the visible legs rather than including the foreground books.
- Rarity captions now reserve their translated width in layout, use 11px mixed-case text, and no longer overlap. Collection circles in the embedded desktop demo are 48px; controls retain touch sizing.
- The item card uses a two-row grid: preview/name/close above, hint/read-aloud below. The English name is no longer squeezed into a character-wide column. Mission width is 320px, bounded by the frame; demo mission/strip white opacity is 0.65 instead of 0.86.
- The demo collection docks right. A named minimise button folds the wide strip; focused item guidance folds it automatically and docks opposite the item's horizontal half. All six remain accessible in the compact sheet. On low-edge phone hints the card is raised within the demo frame, with explicit physical left/right anchoring to avoid RTL overflow. Landscape cards use 320px width.
- Browser checks: English desktop name/rarity spacing, successful acquisition of the previously obscured purple boat, English 390×844 portrait sheet and hint card, 844×390 landscape exact hints in English and Hebrew. In the final Hebrew landscape check the 320×122.5 card was fully inside the 781×330 frame and clear of the exact boat highlight. The repaired library asset was loaded and the child successfully found in the actual serial flow.
- Follow-up regression suite: 7 files / 35 tests passed on Vitest 4.1.11 (collection, public beach assets, demo store, viewport, frame breakpoint and i18n); TypeScript passes. Browser QA remains behind its normal access gate; no bypass is used.
