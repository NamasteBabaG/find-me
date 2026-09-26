# Board-paint recheck response — 2026-09-26

Input: `CLAUDE_BOARD_PAINT_RECHECK_20260924.md`, reviewing release `6b3d9aec`.

## Disposition

- **F-A remains OPEN.** No real-provider v12 output was produced in this pass. The approved two-step edited image is a visual target, not evidence for the engine's single-pass recipe. No bulk rendering, replacement of delivered assets, or catalog activation. Requested approval for a separate three-hide dragon-cave sample, one attempt per hide, through the real runner. Freeze the deployed v12 wording: any changes to skin-tone/style wording, child facial planes, or reference contract must have a new recipe version and new evidence, not silently rewrite v12.
- **F-B fixed.** A persisted historical recipe inconsistent with the scene's historical rendering contract stops before reading art, changing attempts/status, or purchasing. The render boundary independently checks `expectedPromptVersion` before its ledger or provider calls. It cannot relabel a stored v11 row to the scene's v6 after purchase. Correct historical rows still resume unchanged; generated rows still return without repurchasing.
- **F-C fixed.** Short desktop layouts resize both the memory and width-driven collection tiles, not only the photograph. Compact heading line heights and phone spacing preserve all six labels. Mobile action text wraps inside its own button. Main actions remain 64 px, secondary actions at least 48 px; no labels are ellipsized or hidden to pass the fit check. Normal-size desktop keeps the larger layout.
- **F-D fixed.** Final-board action says “Back to the map” for zero/one world, “All worlds” for multiple worlds. The store also guards every `goToWorlds()` caller, preventing the empty hub even outside this ceremony.
- **F-E unchanged.** No new claim about connector metadata. Release identity must be verified with the actual deployment and source SHA.

## Verification

- Targeted engine/store/ceremony suites: 66 passed.
- Full `npm run check -- --maxWorkers=2`: 267 files, 3,458 passed, 2 expected failures, 35 skips. A preceding run crossed a long host suspension and had worker timeouts; it is invalid evidence and is not counted as a passing gate.
- Scene and adventure validators passed with existing scene-size/replay warnings; no content files changed.
- Browser replay uses two NEW local-only, single-board fixtures (Hebrew and English) referencing existing approved art. English fixture has deliberately long discovery names. No paid rendering, no writes to existing games, no QA database mutation.
- `scripts/verify-finale-short-viewports.mjs` collects six discoveries and finds three children with real pointer input, then measures the actual completion dialog at 1440×900, 1366×768, 1366×700, 1366×650, 1366×620, 1280×600, 390×844, 360×640 in each language. Assertions cover internal scroll, page overflow, action visibility/size, and text staying within button bounds. The final action must actually leave the dialog for the board map; no empty-world hub. Screenshots and metrics are private local evidence under `output/passport/short-viewports/`.

## Brief for Claude

Recheck the new release SHA, independently:
1. A mismatched stored v11 / legacy-scene row must stop before any provider/ledger call and remain byte-for-byte unchanged; valid v11 and v12 paths must still work.
2. Replay three finds and six discoveries in both languages. Test the short sizes above, long labels, and button text bounds — not only document overflow. Exercise zero, one, and multiple world final actions.
3. Challenge error/retry, reduced motion, keyboard focus and muted audio for regressions. Smaller artwork must not reduce touch targets or truncate labels.
4. Keep F-A open until actual paid runner outputs are inspected against the approved reference at native scale and in the full board. An image-edit demo, mock adapter, or green unit test cannot close that gate.

Deployment/CI identity will be recorded separately after the clean QA release completes. This document is not a production or bulk-render approval.
