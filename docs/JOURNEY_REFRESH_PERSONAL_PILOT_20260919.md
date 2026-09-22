# Amazon refresh — first personal integration, 19 September 2026

## Status and scope

Amazon v6, approved by the parent as art, now has an **isolated local personal pilot**: 1 board, 3 sequential Bar appearances, 6 discoveries, completion and passport. It is not a nine-board release, not deployed to QA, and not registered in the live wizard catalogue. Existing games and their old source/patch coordinates remain unchanged. No wizard, payment, parent-flow or Claude design files were edited.

**User playtest feedback, 19 September 2026:** after receiving the local game link and the 3-hide/6-discovery/ passport summary, the user replied **"עובד טוב"** ("works well"). Record this as positive acceptance of this local pilot and use the selected `2,1,1` outputs as the continuation baseline. It is not a claim that the user separately certified every likeness, device or edge case, and it does not approve unrendered appearances or imply a QA deployment. No additional paid call, live catalogue change or deployment was made when recording this feedback.

The staged source is `public/scenes/adventure-amazon-refresh-v6/base.webp`, lossless 3840×2160, SHA-256 `bd7c8c87d9b8e29fed9282606a4523d45db357b328117f7cb27b8428ad0682f3`. Its approved PNG master is pinned in the prior art review. A 960×540 thumbnail is separate from game art. `content/adventures/journey-refresh-pilot.ts` is staging-only; ready there means authored art/geometry, not a live release certificate.

## Identity contract — applies to every subsequent refreshed board

- The authorized photo and reviewed canonical portrait of Bar, age 5, are the **only face and hair identity authorities**. Preserve face silhouette, cheeks/jaw, eye shape/spacing/colour, nose/mouth, hairline, brown base colour and curls.
- Scene people supply pose, age-appropriate wardrobe, depth/scale, support, occlusion, local illumination and painted marks. They do **not** supply facial features, skin identity or a different hair colour. Do not average Bar with a bystander.
- The existing v11 portrait-only product prompt supplies exactly two images: source crop and canonical portrait. No third image of local people's faces. The global paid prompt was not changed and old paid fingerprints were not reset.
- Review the actual composited shipping patch, its native surrounding context and original identity. A seam check or automated likeness pass alone is not parent approval. Reject absent/duplicate children, clipped heads/limbs, bad overlap, changed objects or displaced rails.
- Keep the approved board immutable and author new crops/hitboxes for each new image. Never reuse old personal patches with refreshed artwork.

## The three appearances

| Hide | Activity | Selected attempt | Observed result |
| --- | --- | --- | --- |
| 1 | Leaning on boardwalk rail below sloths | 2 | Brown curly portrait identity, teal shirt; supported arms and natural rail/paddler occlusion |
| 2 | Building a leaf boat with an adult | 1 | Same face, kneeling body behind tray, coherent hand contact |
| 3 | Reading the wildlife book with a family | 1 | Same face, seated body, book/leg overlap intact |

Hide 1 attempt 1 was rejected: background/rail moved and mean border difference was 34.04. A source-bound explicit repair preserved scene geometry; attempt 2 scored 11.85 with zero detected shift and a permitted bounded fade. The failed output remains retained evidence and is not shipped. No seam thresholds were weakened.

Both assistant inspection of all final 512×768 shipping crops/full native contexts and the existing grouped production reviewer accepted the selected vector `2,1,1` for local play. Bar's yellow hoodie remains in hide 3; hide 2 wears blue instead of the source mustard shirt. These are disclosed wardrobe deviations, not claims of exact source-clothing preservation. The subsequent positive user playtest feedback is recorded above; every future board still requires its own identity and integration review.

## Discoveries

The six measured targets are red binoculars, yellow bottle, orange frog, blue butterfly, spiral shell and the carved-looking wooden bird. Rarity is 3 common / 2 rare / 1 epic. All full personal return windows are disjoint from all six collectible card crops, not just their click points. Each target was clicked successfully in the actual desktop game and in portrait mobile play with pointer panning. Bird material is visually interpreted as carved-looking; the game uses its exact picture rather than treating all birds as interchangeable.

## Evidence

Private evidence stays under ignored `storage/journey-refresh-bar-20260919/`: source/identity hashes, immutable inputs, paid receipts in SQLite, original render bytes, technical seam reports, grouped reviewer result, assistant `final-review.json`, measured actual-child hit geometry, game DB, screenshots and persistence evidence. **Never publish that directory or owner sign-in tokens.**

Existing pilot scripts now accept leading `--journey-refresh`. They still use the product renderer, retained purchase ledger, grouped reviewer and normal private asset/game/passport services. No alternate API transport or direct test progress injection was added. The game assembler explicitly rejects journey-refresh QA mode until rollout review. Rendering is off and payments mocked in the local game server.

### Browser → service → stored progress → passport

- Desktop 1440×900: all 6 object clicks and all 3 visible face clicks succeeded, completion opened, no browser errors, zero document overflow.
- Mobile 390×844: replay started at 0 finds / 0 discoveries; real horizontal pointer drags reached off-screen objects without synthetic state changes. All 6 objects and 3 appearances were completed again, with zero browser errors/overflow. The initial desktop-only test correctly refused an off-screen click; its driver was extended to pan through actual pointer gestures. This was not a product hitbox fix.
- Backend after original run: album revision 9, 3/3 stars, 6/6 discoveries, 1/1 postcard. After replay: same revision and counts, no duplicate permanent rewards and no erased collection.
- Actual passport media loaded (7/7 image elements), with photograph and six cards visible, desktop and mobile, no document overflow. An early screenshot caught media before initial development compilation finished; subsequent screenshots and load checks confirmed rendered assets.
- Fresh unauthenticated player-link session opened the gift/welcome flow without owner login. Owner credentials were not included in its URL.
- Mobile completion item labels can occupy several lines at 390px; they do not overflow, but this is not a claim that every pre-existing ceremony design detail is polished. No design changes were made during art integration.

### Automated checks

- New staged-board tests: frozen approved source, 3 non-colliding hides, protected 6-card geometry, exact portrait-only identity contract per hide, game/progress/passport round trip, duplicate-event idempotence, and refusal of unreviewed personal hit geometry.
- Focused identity/authoring suites passed; final TypeScript check passed.
- Full `npm run check`: 253 files passed, 1 file failed; 3380 tests passed, 1 timeout, 2 expected failures and 35 skipped. The timeout was in the unchanged `fixed-world-staging.test.ts` duplicate-assets case (20s under suite load). That entire file was rerun alone: **29/29 passed in 23.01s**. Do not rewrite this as an entirely green full-suite run.

## Incremental paid cost

Retained accounting records 93,121 micro-USD for 4 image attempts (including the rejected first attempt) and 3,021 for the grouped reviewer: **$0.096142** total. No pending/unknown requests or held spend. This is only this pilot's incremental hide/review cost; it excludes the already-created identity, base-board art and operational expenses. The runner enforces a $2 reservation ceiling even though the underlying ledger audit reports its generic $5 default; the stricter runner cap governs these requests.

## Next

1. Completed: user returned positive feedback on the local pilot. Preserve its approved art and selected personal outputs as the continuation baseline; no additional Amazon rerender is needed without a newly observed defect or feedback.
2. Author each remaining refreshed board's final six-object map and new three-hide geometry; close duplicate/edge-target issues documented in individual art reviews before rendering.
3. Keep new artwork and private assets versioned together; perform the same native identity/occlusion and desktop/mobile gameplay checks.
4. Only then assemble the refreshed full-world release and deploy through the normal QA path. No claim is made that the other seven refreshed boards already have personal hides.
