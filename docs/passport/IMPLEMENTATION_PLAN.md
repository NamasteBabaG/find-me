# Passport / family area — implementation agreement

Owner: Codex implementation; Claude independent QA/challenge. Source: SOURCE_SPEC_HE_V1.md.

## Latest product decisions (supersede legacy assumptions)

- Existing games are tests, not backward-compatibility product requirements. No destructive cleanup is implied.
- Current product: independent adventures, nine places, three personal hiding spots and six discoveries per place.
- Public account navigation is **Family area / האזור המשפחתי**, never “My games”.
- Parent chooses an existing child or adds a new child before creating an adventure. Same name is never an identity key.
- One passport per family child. Rendering profiles stay per adventure: uploading a new photo must not destroy another adventure's identity assets.
- Purchases and progress are scoped to the selected child, not pooled across siblings.
- Old unassigned test games remain separate; no automatic name/photo matching or silent migration.

## Reader design agreed in the follow-up

- Desktop: one board occupies a two-leaf spread. The closed cover and opened book have the same height; the book gains width, not height. The reader itself must fit an ordinary laptop viewport without scrolling.
- Mobile: both leaves become one continuous paper page, not two nested cards. Horizontal swipes turn places; vertical gestures remain native scrolling. Translucent edge arrows remain available.
- The paper, binding, cover palette and shadows belong to the same object. Opening uses a hinged cover; desktop page changes use a turning leaf. Reduced motion must bypass decorative movement, not navigation.
- Discoveries are small keepsakes, six per spread, with details in a dialog. Large facts and picture choices must not expand the book.
- Preserve the current place through resize and data refresh. Reading position is not an achievement and is not shared publicly.
- Short phones may scroll a little vertically rather than clip controls or shrink all text. Measured baseline: 1366×768 desktop and 390×844 / 360×740 mobile have zero document overflow; 360×640 needs 98 px vertically and zero horizontally.
- Independent QA belongs to Claude after implementation. This branch is a local review candidate, not an automatically approved QA deployment.

## Delivery sequence

1. Family identity, ownership fences, child chooser and parent landing. Tested against real temporary SQLite.
2. Derived passport view model and private book, board photo selection and durable ceremony acknowledgement. Existing progress remains authoritative.
3. Replay: new discoveries persist, old stamps/photos do not reset. One completion ceremony.
4. Separate, revocable, read-only passport sharing including media authorization; approved fictional homepage example.
5. End-to-end browser and privacy gates, clean release, Claude challenge brief with exact evidence and open items.

No deployment, production schema mutation, paid generation or public sharing of real children's assets is implied by implementation. Do not label an unfinished surface complete. The source specification's sharing and demo acceptance tests remain release gates.
