# Paris v5 — bakery replacement, rejected intermediate

2026-09-18. **Not accepted as the requested correction. No gameplay/catalog/QA changes.**

- Output `output/imagegen/journey-paris-v5-shallow-boulangerie.png`: verified PNG 3840×2160, 19,001,693 bytes.
- SHA256 `6412a947ad568a25030281769ca4fca0436cd924be12b0e8dbc30bcd9a97bef2`.
- Prompt `docs/art/journey-paris-v5-shallow-boulangerie.prompt.txt`.
- Inputs: v4 Paris plus the approved castle face-style crop, explicitly restricted to style.
- Existing authorized API credential; bundled Imagegen CLI; `gpt-image-2`, quality high, n=1. Request completed in 122.3 seconds. Exact billing not returned.

## Observed result against requested changes

The generic building-block scene is gone. A real bakery frontage, baskets/trays of croissants and baguettes, supervised pastry-making, cargo bread delivery, a crepe cart and flowers are prominent. The scene remains sunny and contemporary. However, the model REMOVED the portrait artist instead of fixing the girl's seating. A seated flower-making group appeared in its place. Miniature background people and substantial foreground scale growth also remain. Those are explicit failures, not a complete correction.

Visible target types include heart beret, star cup, toy bus, key/ribbon and violet paper boat, several still too low/peripheral. A distinct metal Eiffel souvenir was not verified. No target-map coordinates have been activated or claimed correct.

One focused follow-up (v6) restores the portrait group with properly separated furniture and attacks the miniature background crowd and scale gradient while retaining the bakery identity. v5 is retained for provenance only, not published or used as an active board.
