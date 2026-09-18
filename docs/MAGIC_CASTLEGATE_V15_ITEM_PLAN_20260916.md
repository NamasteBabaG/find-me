# Castle v15 — item repair plan before generation

Source: approved v14. Only six props are in scope; no new board redesign or application changes.

Read current worktree `src/game/game.css` and `src/game/components/collection.css`: top-left tools, top-right mission, bottom collection (left/right docking), and additional seeking cards. Avoid exterior targets. Conservative authoring region x20–80%, y25–72% is a planning restriction, NOT a universal mobile/HUD guarantee: viewport transforms and open sheets need runtime checks.

| Target | Rarity | Planned center (3840x2160) | Story landmark | Size |
|---|---|---|---|---|
| Copper bell | common | 1000,1320 | bench beside knight/kittens | 90px tall |
| Wooden dragon | common | 2890,960 | puppet stage | 125px long |
| Striped feather | common | 1180,825 | storyteller book | 100px long |
| Silver key | rare | 2235,630 | gatekeeper desk front-right | 95px long |
| Folded map | rare | 2780,1390 | small picnic basket by block-building child | 110px wide |
| Moon brooch | epic | 2280,1270 | king's green cloak shoulder | 70px tall |

Remove old bell, bottom feather, bottom-shelf wooden dragon and far-right basket map. Verify outputs independently: exactly one identifiable target each, recognizable cropped shape, actual measured rectangles inside conservative region, no overlaps, and preservation of approved artwork. Do not turn intended coordinates directly into gameplay hotspots. Actual output rectangles must be measured. Mobile/runtime integration remains a separate uncompleted gate until tested.
