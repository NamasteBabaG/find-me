# Claude design brief: worlds, replay and friends

Date: 2026-10-05. Phase 2: recommendations only, after the functional release checks.

## Your task

Review the current Find Me Worlds experience and recommend concrete design upgrades. Help a child understand where to go, what a tap did and how to continue playing. Help a parent understand which world is already theirs, how to add another world and what a friends invitation shares.

Read the current source before forming conclusions. Return a design report; do not change code, configuration, assets or data. Do not run image generation, email, payment or other provider requests. Do not inspect private photos, customer files, credentials, databases or `.env` files. No new story, difficulty level 2 or third world belongs in this task. The existing two worlds and their current gameplay rules are the scope.

This is a source review. Source can establish a rule, a missing state or a likely layout risk. It cannot establish what the rendered screenshots look like, whether a child notices a cue, whether controls are easy to reach on a real device or whether the hiding spots are too easy. Label visual and usability hypotheses clearly. Propose the later checks needed to resolve them; do not claim those checks happened.

## Product decisions to preserve

- Keep the experience playful and coherent with the existing site. Refine hierarchy and feedback before adding decorations or more text.
- Keep unreached boards a surprise. Use the existing world/place emblems or illustrations in catalog and navigation. Do not reveal a playable board, its hiding spots or a postcard of an unreached place there. Earned passport memories and the intentionally public demo have separate purposes.
- A child's play area has no checkout, price, upsell or payment form. Parent purchase flows remain outside the scene. An owner-only world selector may lead to a clearly separate parent area; guest play must not gain that selector or parent links.
- A restart is another round, not deletion. All earlier finds, discoveries and passport memories remain, including an unfinished journey. A replay should continue directly to the next board without repeated detours through the map.
- Distinguish finding the child from optional discoveries. Completion and the next-place decision should be clear without a permanent paragraph covering the board. Use the actual published target totals; never assume every historical game has the same number.
- Keep the child's illustrated portrait contained cleanly in its shape. Avoid a square inside a circle and duplicate portraits where one is enough.
- Every control responds immediately to a tap. A pending operation shows that it started, a saved state reflects a real acknowledgement, and an error keeps the user's work visible.

## Current flows and constraints

**Owner worlds and purchase.** The family area and the owner map distinguish worlds that are ready, being prepared, awaiting payment, available to buy or needing attention. An owned ready world continues its own progress. A new world is for the same child/passport; the parent confirms the current age for the new character while a resumed purchase preserves its frozen age. Reuse the existing purchase intent and context when proposing navigation. The server owns eligibility and prices. The first-world/continuation price rules already exist; do not invent another pricing scheme or promise an unverified purchase state.

**Gameplay and replay.** The map, board, collection tray, completion postcard and passport form one journey. Optional discoveries should be recognizable, inspectable at a useful size and easy to return from. Motion and audio can make feedback pleasant, but must respect sound settings and reduced motion. A child should understand continue, stay to find discoveries, replay this board and start another round without reading a long explanation. Preserve saved progress through Back, refresh, world switching and interruptions.

**Friends.** This is a separate, parent-authorized invitation to one frozen game/world. It is not the ordinary PLAYER link and not the existing view-only passport link that includes future passport updates. Guests have independent results, predefined nicknames and one predefined reaction after finding all delivered targets. They cannot see other participants, browse the parent's other worlds or buy anything. The latest participant on a shared device can resume; starting another participant preserves the earlier report, but must honestly explain and handle saving that is still pending. Do not promise recovery of an older participant's session unless the implementation supports it.

Friends links expire after 30 days. Results remain for 90 days after the earlier closure/expiry boundary. A revoked, expired or repaired/stale invitation cannot silently claim to be active. A parent can create a replacement; old retained results stay available privately to the owner. The link is disclosed only when created. Parent reauthentication, consent, replacement, revocation and removal need clear states, not extra fictional guarantees.

**Who found me.** Owner reports distinguish a board never visited, actually displayed with zero finds, partly found and complete. Opening a report alone does not mark new activity seen: the relevant result cards must actually be displayed. Do not collapse zero finds into “not visited,” present an old result as live access or expose guest reports to other guests.

## Latest guest viewport repairs and validation limits

The local browser checks use synthetic participants and the public demo, not customer photos or games. A 320×640 guest screen previously put the game at y=112…752 and the discoveries button at y=672…736, outside the viewport. The scoped `friends.css` flex layout now gives the game the remaining 528px: the document ends at 640px and the discoveries button is at y=560…624. Owner game geometry is unchanged.

Short landscape at 640×360 also exposed the sound control below the visible guest game. The guest-only low-height toolbar now places the four tools in two 64px columns beside Back. The collection tray needed a separate repair because its previous `dvh` bound still measured the entire viewport rather than the remaining game: guest game size containment now bounds tray and seek-card height with `cqh`, leaves room for the 64px handle and safe margins, and places the open collection above the mission UI. Recheck the latest tray, seek-card, scroll, focus and dismissal geometry at 320px/390px portrait and short landscape before treating those repairs as complete visual validation. Do not recommend shrinking their touch targets or changing owner geometry to make them fit.

Long English lobby action labels inherit `white-space: nowrap`; clipping at 320px is a source-based hypothesis until measured. Evaluate it alongside long nicknames, RTL, safe areas and short screens rather than assuming a pixel failure or proposing a general redesign.

The child pilot and difficulty/level 2 remain explicitly deferred. No child usability session has been completed in this release work. Recommendations about hiding difficulty, face brightness, cues, sounds or comprehension require later sessions with children in the intended age range and their parents. Do not call the experience child-tested, add level 2, or start the third world during this design review.

## Source map

Read these in the checked-out release. Treat current source and tokens as authoritative if a dated design document disagrees.

| Area | Starting sources |
| --- | --- |
| Design language | `docs/DESIGN_SYSTEM.md`, `docs/I18N.md`, `CLAUDE.md`, `src/styles/tokens.css`, `src/styles/ui.css`, `src/ui/Button.tsx` |
| Family and world selection | `src/app/family/[childId]/page.tsx`, `src/app/family/FamilyParts.tsx`, `src/services/family-adventures.service.ts`, `src/game/components/OwnerWorldSelector.tsx`, `src/game/components/OwnerWorldSelector.css`, `src/game/components/WorldMap.tsx` |
| Parent purchase | `src/app/family/[childId]/worlds/[worldSlug]/purchase/`, `src/app/checkout/CheckoutForm.tsx`, `src/app/create/saved-step-navigation.ts`, `src/domain/world-purchase.ts`, `src/services/world-purchase.service.ts`, `src/services/world-purchase-checkout.service.ts` |
| Play and replay | `src/game/components/GameShell.tsx`, `src/game/components/ScenePlayer.tsx`, `src/game/components/RoundControls.tsx`, `src/game/components/PassportCompletion.tsx`, `src/game/store/play-store.ts`, `src/game/game.css` |
| Discoveries and passport | `src/game/components/Collection.tsx`, `src/game/components/Album.tsx`, `src/game/components/AdventurePassport.tsx`, `src/game/components/PassportMemory.tsx`, `src/ui/passport/`, `src/game/engine/passport-storage.ts` |
| Friends UI | `src/ui/friends/FamilyFriendSharing.tsx`, `src/ui/friends/FriendDiscoveries.tsx`, `src/ui/friends/FriendPlay.tsx`, `src/ui/friends/FriendDialog.tsx`, `src/ui/friends/request.ts`, `src/ui/friends/friends.css` |
| Friends contract | `src/domain/guest-sharing.ts`, `src/services/guest-sharing.service.ts`, `src/game/engine/friend-progress.ts`, `src/app/api/friends/` |
| Copy and behavior checks | `src/i18n/dictionaries/`, `src/ui/friends/__tests__/`, `src/game/components/__tests__/owner-world-selector.test.tsx`, `src/game/engine/__tests__/friend-progress.test.ts`, `src/domain/__tests__/guest-sharing.test.ts` |

## Design system to use

Use the existing “Playful Premium” system: warm paper, dark ink, saturated sun/lavender/aqua accents, soft layered depth and clear geometric type. Site/parent type uses Rubik; child controls use the existing Fredoka stack. Use the 8px spacing grid and named radius, shadow, color and motion tokens. The current tokens define adult touch targets at 48px and child targets at 64px. New child controls must have at least a 64×64px usable touch area; inspect existing smaller controls rather than silently treating them as compliant. Do not alter hit geometry or make a hiding spot easier in order to enlarge a toolbar button.

Use logical layout properties for RTL. Keep monetary amounts, share URLs and icon order readable in mixed-direction text. Color alone must not communicate progress or a pending/error state. A focus outline, selected mark and accessible name should survive the visual polish. Respect safe-area insets, reduced motion and muted sound; no animation may become a prerequisite for continuing or saving.

## Questions to answer with concrete proposals

1. What belongs on the map, the board HUD, the completion choice and the passport? Remove duplicated portraits, repeated explanations and competing primary actions. Show the proposed hierarchy and concise HE/EN labels.
2. How should an owner move between ready worlds and return to the current board without losing their place? What should unavailable, preparing and payment-pending cards do when tapped? Keep catalog previews free of board spoilers.
3. How can the purchase handoff preserve the selected child/world/age and return context while feeling quick? Show the form's immediate pending state, interrupted sign-in, already-owned world, competing checkout and recoverable error states. Do not move expensive generation into the wizard.
4. How should a parent invite friends, copy or replace a link, identify a stale/closed invitation and inspect results? Make scope and the consequence of replacement clear with minimal copy. Separate the playable invitation from the live view-only passport share.
5. How should a guest start, resume, switch participant, save while offline and send the final reaction? Make the current participant obvious without turning the identity strip into a second large HUD. Show what happens to a pending save before another player starts.
6. How should “Who found me” show new activity and board states on a phone? Explain how the user sees what is new before it is acknowledged. Avoid a dense admin-style table and avoid revealing other guests to a guest.
7. Which existing motions, sounds and loading states improve understanding, and which compete with searching? Suggest small, bounded feedback changes. A passport should have a stable meaningful loading state, not an empty book that gradually fills without explanation.

For every recommendation give the current source evidence, proposed behavior/layout, why it helps, affected files, acceptance checks and any behavior/privacy tradeoff. Separate verified functional problems, design opportunities and hypotheses requiring visual/user validation. Prioritize a small implementable first batch; do not recommend a wholesale rebrand.

## Acceptance cases for the proposed design

| Case | Required result |
| --- | --- |
| HE RTL and EN LTR | Primary flow, stars, world selector, dialogs, long world/nickname text and mixed-direction link/price fields remain readable without clipping. Provide actual short bilingual copy suggestions. |
| Narrow/short mobile | Review 320px, 390px and a short 640px-tall viewport, portrait and landscape, including safe areas. No horizontal overflow or unreachable action. Child controls have 64px usable targets and do not obstruct important play regions. |
| Keyboard and focus | A dialog has an accessible title, stays navigable, handles Escape/Back coherently and restores focus to a useful trigger. Selected, disabled and pending states are distinguishable. |
| Reduced motion / muted | Every proposed animation has a usable static alternative. No required wait for a celebration or sound; mute remains respected after world/board transitions. |
| Every tap | A press has immediate feedback. Pending labels retain button size. Duplicate requests are guarded. Loading, success, offline and refused/unavailable states do not look frozen. |
| Board reveal | A board is reported visited only after assets, curtain and playable mission are ready. A failed load never counts as a visit. Catalog/map previews do not spoil unreached boards. |
| Partial progress and restart | Leave halfway, refresh, continue, replay one board or start a whole new round: earlier progress and passport memories survive, and replay can proceed directly to the next place. |
| Discoveries remain | Finish the required child finds with some discoveries missing: a concise animated/static cue can point to the collection without blocking. A selected discovery opens a legible larger view and returns cleanly to play. |
| Parent purchase | No buying controls inside the scene. Reauthentication and return navigation preserve the selected child/world and the resumed age. A ready owned world offers play, not a duplicate charge. |
| Stale/closed invitation | A repaired config, revocation or expiry cannot display an active invitation. A replacement is explicit; retained earlier reports remain clearly historical. |
| Shared-device guests | Resume current participant or start another without merging their finds. A pending/offline save has honest feedback; another tab switching the cookie cannot silently save to the new participant. |
| Save/reaction recovery | Slow, offline, rejected and lost-acknowledgement writes keep recoverable progress. First saved reaction remains canonical; a different choice from a second tab cannot create an endless offline retry state. |
| Owner reports | Unvisited, visited with zero finds, partial and complete are distinct. New activity is acknowledged after the relevant cards were actually shown, not merely when the dialog opened. Guests cannot open these reports. |
| Passport loading | Keep an existing page visible during refresh; reserve space while first loading. Errors explain how to recover without implying the child's progress disappeared. |

## Deliverable

Return a concise prioritized design report with source file/line references, a proposed first implementation batch, short HE/EN copy and a state/acceptance checklist. Textual layouts or small Mermaid flows are enough. End with the exact synthetic/public-only screenshots and child/parent usability sessions still needed before anyone can call the experience visually polished or child-tested. Do not implement the recommendations in this phase.
