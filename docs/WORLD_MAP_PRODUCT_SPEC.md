# World Map, Board Journey, and Expansion Commerce

Status: product direction and implementation brief

## 1. Product decision

The product hierarchy changes from a flat list of scenes into a journey:

```text
Game
└── World
    ├── Artistic world map
    ├── 9 boards
    └── 3 find-the-child missions per board
```

Terminology:

- `World` is a themed collection and a purchasable entitlement.
- `Board` is the current `SceneDefinition` concept.
- `Mission` is one of the three child targets inside a board.
- Internally use `board`; consumer-facing Hebrew may use `שלב` or `מקום` if that tests warmer than `בורד`.

The current nine scenes become World 1. Do not create the other eighteen boards as part of the first map milestone.

## 2. Commercial model

| Package | Worlds | Boards | Missions | Price |
| --- | ---: | ---: | ---: | ---: |
| First Adventure | 1 | 9 | 27 | ILS 39 |
| Big Journey | 2 | 18 | 54 | ILS 69 |
| All Worlds | 3 | 27 | 81 | ILS 99 |

The package unit is now a world, not an individual board.

Upgrade pricing must preserve price fairness. A customer must never pay more because they started small:

- Own 1 world: unlock one additional world for ILS 30, or both remaining worlds for ILS 60.
- Own 2 worlds: unlock the final world for ILS 30.
- Own all 3 worlds: show no commerce; offer replay and collection completion.
- Buying 1, then upgrading twice, must total ILS 99 exactly.
- All upgrades are normal orders. The payment webhook remains the only authority that grants an entitlement or starts generation.

If a newly purchased world still needs personalized assets, do not claim instant access. Show the existing friendly creation state and send the ready email when generation and QA finish.

## 3. Product purpose of the map

The map is not a technical menu and not a grid of thumbnails. It is a central piece of the game fantasy.

It should make the child feel:

- “I am travelling through this world.”
- “I can see where I have been and where I am going.”
- “My character lives inside the game, even between boards.”
- “Finishing a board changes the world.”

The child avatar is the live map marker. After completing a board, the child visibly travels from the completed node to the next node.

## 4. Shared map grammar

Every world receives its own fully illustrated map asset and art direction, but all maps share the same interaction grammar:

- One full-bleed artistic map.
- Nine authored board nodes with normalized coordinates.
- One clearly authored route running through the nine nodes.
- A personalized child marker.
- A unique artistic icon or medallion for every board.
- Completed, current, next, and future node states.
- A world-level collectible set with nine pieces or stamps.
- A completion reward after node nine.
- The same mobile, keyboard, accessibility, RTL, and reduced-motion behavior.

The route and environmental scenery should be painted into the map asset. Interactive nodes, the avatar marker, progress effects, labels, and hit targets remain data-driven DOM layers so they can respond to state and language.

Do not fake board icons with emoji or generic UI circles. Use authored mini-illustrations, existing board art crops, or purpose-made medallion assets that belong to the world's visual language.

## 5. World 1 concept

Working name:

- Hebrew: `המסע המופלא`
- English: `The Wonderful Journey`

Alternative marketing name: `מסביב לעולם ומעבר לו` / `Around the World and Beyond`.

Narrative wrapper:

> A magical passport takes the child through nine surprising destinations, from the beach all the way to space.

Recommended board order for a coherent escalation:

1. Beach — the journey begins.
2. Ship — leave the shore.
3. City — arrive at the busy city.
4. Market — explore its colors and sounds.
5. Park — a calmer middle beat.
6. Stadium — a large celebration beat.
7. Jungle — the journey becomes adventurous.
8. Volcano — the fantasy intensity rises.
9. Space — the finale and largest visual reward.

The existing board definitions can be reused; only their world grouping and canonical journey order change.

World 1 shared language:

- Magical passport and travel stamps.
- A winding painted route connecting distinct biomes.
- The recurring bonus character can appear beside some map nodes.
- Each completed board grants one destination stamp.
- All nine stamps complete the child's adventure passport.
- The visual journey begins familiar and becomes increasingly fantastical.

## 6. Future world concepts

These concepts establish the architecture and future art direction. They are not approval to generate all eighteen boards now.

### World 2: The Imagination Kingdom

Shared language: magical key, jewel collection, purple/turquoise/gold palette, enchanted roads, playful fantasy rather than danger.

Candidate boards:

1. Enchanted Forest
2. Crystal Castle
3. Dragon Valley
4. Candy Kingdom
5. Underwater City
6. Cloud Village
7. Wizard School
8. Toy Workshop
9. Moon Carnival

### World 3: The Time Machine

Shared language: friendly time machine, clockwork route, timeline fragments, gradual visual movement from ancient to future.

Candidate boards:

1. Dinosaur Valley
2. Ice Age
3. Land of the Pyramids
4. Ancient Harbor
5. Kingdom of Knights
6. Inventors' Workshop
7. The First Flyers
8. Retro Future City
9. City of Tomorrow

The final board lists and names require a separate art-direction approval before production.

## 7. First-entry flow

The desired child journey is:

```text
Gift Reveal
→ Owned Worlds hub (skip when only one world is owned)
→ World cover / short portal transition
→ Artistic World Map
→ Child marker arrives at the start node
→ Current board wakes up
→ Child taps the board icon
→ Board intro and three missions
```

On first entry to World 1:

- Show the world title and one short narrative line.
- Reveal the map, then animate the child marker arriving at the first node.
- Keep this introduction short: approximately 1.5–2.5 seconds and always skippable.
- Highlight one obvious action: enter the current board.
- Do not place pricing, parent navigation, or promotional banners in the child's primary map chrome.

## 8. Progression model

Use soft-linear progression for the first journey:

- Completed boards are always replayable.
- The current/next board is unlocked and strongly highlighted.
- Future destinations remain visible so the child can anticipate them.
- Do not show aggressive padlocks or failure language.
- Tapping a future node may produce a friendly response such as `עוד מעט נגיע גם לכאן!`.
- After a world has been completed once, all nine boards remain directly accessible.

This preserves the feeling of a journey without making replay frustrating.

## 9. Board-completion transition

After the third mission in a board:

1. Run the existing board-completion celebration.
2. Award that board's world collectible or stamp.
3. Show a short `Back to the map` transition.
4. Return to the map with the just-completed node visibly stamped.
5. Animate the child marker along the painted route to the next node.
6. Wake the next node with a small environment-specific effect.
7. Leave the child on the map until they tap the next board; do not force immediate navigation.

Motion guidance:

- Travel duration: roughly 1.2–1.8 seconds.
- The marker may hop, walk, float, sail, or ride depending on the segment, but implementation should use lightweight transforms/sprite states, not video.
- Face the marker in the direction of travel where practical.
- Keep the movement readable at phone size.
- Offer a skip affordance after a short delay.
- Under `prefers-reduced-motion`, replace travel with an instant position change plus a subtle fade/state update.

The transition must be deterministic and driven by progress state. Reloading the page must never replay a completed purchase or lose the current node.

## 10. Map node states

Every node needs a distinct semantic and visual state:

### Completed

- Full-color icon.
- World-specific stamp/check treatment.
- Replay label available.
- No pulsing animation.

### Current

- Child marker is located here.
- Strongest contrast and largest safe hit target.
- Board title is visible.
- Primary action is obvious.

### Next

- Visible and gently animated after the child arrives.
- Becomes `current` when the transition completes.

### Future

- Visible but quieter, never presented as punishment.
- State is not communicated by color alone.
- Accessible label explains that it is a later destination.

## 11. World completion

Completing board nine is a two-part experience.

### Part A: child celebration

- Finish the final board normally.
- Return to the fully completed map.
- Place the ninth stamp.
- Assemble or reveal the world-level reward.
- Celebrate the child's name and the completed world.
- Offer replay and viewing the completed collection.

No sales CTA interrupts this celebration.

Suggested child copy:

```text
איזה מסע! מצאת את כל המחבואים בעולם הזה.
הדרכון של {name} הושלם!
```

### Part B: grown-up continuation

Only after the celebration, show a visually separate grown-up entry point:

```text
רוצים לפתוח ל-{name} הרפתקה חדשה?
לאזור המבוגרים
```

The purchase UI belongs behind a clear grown-up boundary. It must not look like a reward the child failed to earn, and it must not use pressure, timers, loss aversion, or manipulative child-facing language.

## 12. Upgrade decision logic

The offer is derived from owned world entitlements, not from UI history.

### Customer owns one world

Show:

- `פתחו עולם נוסף — 30 ₪`
- `פתחו את שני העולמות — 60 ₪`

If more than one locked world is available, the one-world option leads to a parent-facing world picker before checkout.

### Customer owns two worlds

Show:

- `פתחו את העולם האחרון — 30 ₪`

### Customer owns all worlds

- Do not show an upsell card.
- Show completed collection, replay, share, and any future `new world available` state only when a real additional world exists.

### Customer has not completed the current world

- The grown-up can still reach upgrades from the library or world hub.
- Do not insert an upsell into the child-facing board loop before world completion.

## 13. World hub and transitions between worlds

When only one world is owned, opening the game may go directly to its map after Gift Reveal.

When two or more worlds are owned, add a World Hub:

- One large artistic portal/card per owned world.
- Visible completion percentage or `9/9` stamp count.
- Locked worlds may appear as restrained parent-facing teasers, but not as disabled rewards in the child's primary play area.
- The most recently played incomplete world is the default continuation.

Entering another world uses a short world-specific transition, approximately 1–2 seconds:

- World 1: passport page / travelling line.
- World 2: magical doorway / key turn.
- World 3: clock or time-machine sweep.

Transitions remain CSS/sprite based, skippable, and reduced-motion safe.

## 14. Data model direction

Add a domain layer above the existing scene/board definitions.

Suggested content types:

```ts
type WorldDefinition = {
  id: string;
  slug: string;
  order: number;
  name: LocalizedText;
  tagline: LocalizedText;
  mapArt: ResponsiveArtRef;
  mapWidth: number;
  mapHeight: number;
  boardSlugs: [string, string, string, string, string, string, string, string, string];
  mapNodes: MapNodeDefinition[];
  theme: WorldThemeDefinition;
  collectible: WorldCollectibleDefinition;
  completionReward: WorldRewardDefinition;
  active: boolean;
  purchasable: boolean;
  version: number;
};

type MapNodeDefinition = {
  boardSlug: string;
  routeIndex: number;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  iconAsset: string;
  labelAnchor?: "top" | "bottom" | "start" | "end";
  markerScale?: number;
  travelStyle?: "walk" | "hop" | "sail" | "float" | "rocket";
};
```

Commerce and ownership direction:

- Package definitions store `worldCount`, not `sceneCount`.
- Games have explicit world entitlements.
- A game world contains nine `GameBoard`/existing `GameScene` records.
- Upgrade orders grant additional world entitlements only after an authoritative payment webhook.
- Price differences are domain rules with unit tests, not values calculated in UI components.
- Existing share tokens continue to address the whole game, including subsequently purchased worlds.

Progress direction:

- Derive completed nodes from completed board progress where possible.
- Persist `lastPlayedWorldSlug` and `lastPlayedBoardSlug` for Continue.
- Persist completion before starting the map travel animation.
- The animation is a presentation of saved progress, never the source of truth.

Do not migrate or rewrite the existing scene model until the domain design and backward-compatibility plan are explicit.

## 15. Artistic map asset contract

The map must be authored for interaction, not generated as an arbitrary pretty image.

For every map asset:

- Reserve nine readable node zones with enough spacing for a 64px child tap target at mobile scale.
- Keep critical scenery away from node labels and the child marker path.
- Paint the route into the art, but keep nodes and labels as runtime overlays.
- Provide normalized coordinates for every node.
- Preserve the Storybook Collage visual language used by the boards.
- Avoid baked text; all text stays localized in the UI.
- Produce responsive WebP/AVIF assets for phone, tablet, and desktop.
- The phone crop must retain all nine nodes. Prefer contain/letterboxed behavior over cropping out destinations.
- Target a practical transfer size; do not ship the 3072px source master directly to phones.

Before final art, create and review a node-placement board that proves all nine destinations, route segments, labels, and the child marker are legible in portrait and landscape.

## 16. Accessibility and child-safety requirements

- The artistic map also exposes a semantic ordered list of nine board buttons.
- Keyboard focus follows route order.
- Every node has an accessible name, progress state, and action.
- State is never expressed only through color.
- Tap targets meet the existing 64px child-target rule.
- Decorative map art has empty alt text; interactive node labels carry meaning.
- Screen readers can skip the travel animation and hear the newly unlocked/current board.
- Respect reduced motion.
- Do not put payment controls in the child-facing map.
- Parent purchase entry points must be clearly labelled as grown-up actions.
- Analytics must not include the child's name or other PII.

## 17. Copy changes

Pricing cards should communicate both content and outcome:

```text
עולם אחד
9 בורדים · 27 חיפושים
39 ₪

שני עולמות
18 בורדים · 54 חיפושים
69 ₪

שלושה עולמות
27 בורדים · 81 חיפושים
99 ₪
```

Consider testing the warmer consumer-facing wording:

```text
9 מקומות · 27 משימות חיפוש
```

Internal names and analytics continue to use `board` for precision.

## 18. Analytics

Add events without PII:

```text
world_hub_opened
world_entered
world_map_opened
map_node_selected
board_started
board_completed
board_map_transition_started
board_map_transition_skipped
board_map_transition_completed
world_completed
world_upgrade_entry_opened
world_upgrade_offer_viewed
world_upgrade_selected
world_upgrade_checkout_started
world_upgrade_payment_completed
world_unlocked
world_switched
```

Useful properties are IDs/slugs, counts, package tier, entitlement count, device type, and elapsed time. Never send child name, email, image data, or share token.

## 19. First implementation milestone

Build the World 1 framework using the existing nine boards. Do not generate the other eighteen boards yet.

Order of work:

1. Write the pure domain model and tests for worlds, board grouping, ownership, upgrade prices, and progression.
2. Add World 1 content data that groups and orders the current nine scene definitions.
3. Add backward-compatible config composition for one world containing the existing boards.
4. Implement the World Map shell with authored node coordinates and temporary existing-art medallions if final map art is not yet approved.
5. Implement deterministic board completion → map → marker travel → next node.
6. Persist and restore the correct world, board, node, and completed states.
7. Implement World Hub behavior for one, two, and three entitlements.
8. Implement the grown-up upgrade decision state and domain pricing, but keep payment behind the existing provider/webhook boundary.
9. Add final World 1 map art only after node placement works in desktop, portrait, and landscape.
10. Update Hebrew/English copy and documentation.

Do not let this milestone interrupt or discard the current uncommitted slot-patch and target-geometry work. Finish, verify, and commit the current work first; then start this feature from a clean tree.

## 20. Acceptance criteria

The milestone is complete only when:

1. The current nine boards appear as one ordered World 1.
2. Entering World 1 opens a full artistic map, not a generic card grid.
3. All nine nodes remain visible and usable on desktop, phone portrait, and phone landscape.
4. The personalized child marker appears at the correct current node.
5. Completing a board saves progress before returning to the map.
6. The completed node receives its stamp and the marker travels to the next node.
7. Reloading during or after travel restores the correct state without duplicate progress.
8. Completed boards are replayable and future nodes are visible but friendly.
9. Reduced-motion users receive a non-animated equivalent.
10. Hebrew RTL and English LTR both preserve the authored map layout and readable controls.
11. Completing board nine produces a child celebration before any grown-up offer.
12. A one-world owner sees upgrade options for one additional world or both remaining worlds.
13. A two-world owner sees only the final-world upgrade.
14. A three-world owner sees no upsell.
15. Sequential upgrades total exactly the original package price: 39 → 69 → 99.
16. No world entitlement is granted before a valid payment webhook.
17. No child PII appears in analytics.
18. `npm run check`, domain tests, and the relevant browser journey pass.

## 21. Explicit non-goals for this milestone

- Do not create all eighteen future board illustrations.
- Do not generate personalized patches for future worlds.
- Do not replace the existing board renderer.
- Do not build video transitions.
- Do not put commerce inside a board or the child's mission UI.
- Do not make animation state authoritative for progress.
- Do not silently change the generation pipeline while the current patch work is uncommitted.

