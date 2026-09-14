# Six denser board proposals — 2026-09-14

Status: **awaiting parent art approval; all child/hide work remains paused**.

## Request and scope

The parent found that zoom-out revealed too much uninhabited ground. Revise the six expansion proposals (Paris, Marrakech, Tokyo, Great Wall, Sydney, Antarctica) by adding many more people and small coherent activities. Preserve the v2 frame, shallow geometry, figure scale and drawing style. Do not revise the three family-tested original boards or the existing game.

## Production and preservation

- Used the explicitly authorized API route through the bundled ImageGen CLI, `gpt-image-2`, high quality, native **3840×2160**. Six edit calls, one per board, all completed successfully. No retry calls or personal renders.
- Each board's v2 zoom-out image was its sole edit/style reference. No new interpretation from a text-only prompt and no reuse of the earlier close-up source as the edit target.
- Prompts requested approximately 35–45 additional people in 10–14 small groups. This is a target, **not a verified exact population count**.
- Scene-specific additions fill foreground and side gaps: chalk games and cafe spectators, basket weaving and cobbling, parcel tying and festival crafts, tangrams and terrace picnics, harbor-map drawing and market families, and station supply/ice-sample activities.
- All six results were visually inspected for a clear population increase, retention of the frame, and continuity of the illustrated style. This is an art-review pass, not approval of every small face, hand, collectible or eventual hide.
- Existing v1/v2 artwork and source manifests are retained. New public files are lossless WebP derivatives of the native PNG outputs, not upscaled small images. Thumbnails are intentionally reduced.

## Files

- Review: `/reviews/adventure-expansion-20260914.html?revision=density-v3`.
- New images: `public/scenes/adventure-{paris,marrakech,tokyo,greatwall,sydney,antarctica}-density-v3/base.webp` and `thumb.webp`.
- Exact prompts, before/after paths and source/result hashes: `content/adventures/expansion/density-review.json`.
- Local raw PNGs and frozen CLI inputs: `output/imagegen/adventure-density-20260914-v3/` (not committed).
- Preparation: `scripts/prepare-adventure-density.ts`; packaging: `scripts/publish-adventure-density-review.ts`.
- Cards 1–3 are unchanged. Cards 4–9 show v3; their “לפני השינוי” links open v2 for direct comparison.

## Approval boundary

`content/adventures/expansion/review-status.json` remains present with `hideAuthoringAllowed: false` and `personalRenderingAllowed: false`. After packaging, `baseArtRevisionAllowed` is also false. The existing personal-render runner still refuses to run while this gate file exists.

No playable catalog, save data, child photo, personal patch, hide coordinates, game record, or deployment changed. No expanded game was created.

After the parent selects final art, collectible identities/visibility and hit regions must be audited/remapped against those exact pixels. Existing coordinate sets must not be inherited. Child hide authoring and rendering require the parent's subsequent approval, including appropriate figure scale and clear likeness to Bar.

## Checks

- `npx tsc --noEmit`: passed.
- `npx vitest run src/domain/adventure/__tests__/expanded-boards.test.ts`: 4 passed on Vitest 4.1.11.
- Packaging preflight: six native 3840×2160 outputs, frozen source hashes, new versioned destinations, closed hide gate, and untouched first-three gallery cards.
- Browser review at 1600×1400: all nine images loaded at natural 3840×2160, all six comparison links resolve to v2, and no horizontal overflow. Screenshot visually inspected.
- Mobile-width check at 390×844: single-column cards fit the viewport and all images remain loaded. A dedicated verification browser was closed; user browser tabs/game progress were not changed.
- Full production build and production deployment were not run for this art-only revision.
