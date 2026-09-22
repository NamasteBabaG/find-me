# Tokyo v4 — neon play plaza, intermediate

2026-09-19. **New art direction; not active in the catalog or QA.**

## Receipt

- File: `output/imagegen/journey-tokyo-v4-neon-play-plaza.png`.
- Verified PNG 3840×2160, 16,876,382 bytes.
- SHA256: `971c9da9372ec286df3a0a3c23ec8bc155e051a31d2b4ad3c715a6bb9a5b7bcf`.
- Prompt: `docs/art/journey-tokyo-v4-neon-play-plaza.prompt.txt`.
- Route: bundled Imagegen CLI, existing user-authorized API key, `gpt-image-2`, high quality, n=1, edit endpoint for reference-conditioned generation. Completed in 134.2 seconds; exact charge unavailable.
- Reference 1: approved dinosaur-valley v2, restricted to composition, scale and illustrated finish. Reference 2: approved castle face crop, restricted to dimensional face/anatomy treatment. This is a new Tokyo scene, not a reuse of the old active Tokyo base.

## Observed scene

Modern neon storefronts, train, arcade and claw game, rhythm pad with grandparent, mint service robot with drinks, taiyaki and noodle counters, photo booth, capsule toys, vending machines, book/souvenir stalls, origami, dancers, toy-car table and a family with a dog and umbrella. No medieval/period wardrobe imported from the references.

Pink/blue signs, warm shop interiors and restrained wet-pavement reflections provide readable local night lighting. Faces are generally readable and the inspected service-robot group has no painted food/white-skin blemish. The large mint service robot is visually distinguishable from the yellow search toy. A small receding crowd remains at the far right; not a claim that the scale constraint was perfectly obeyed. The requested bubble activity did not appear and is not counted as delivered.

Inspected full image and native crops: `output/imagegen/journey-tokyo-v4-inspection/craft-and-search.png`, `faces-and-service.png`.

## Failed search-prop checks

All six intended categories have visible candidates, but this is NOT a valid final mapping:

- Yellow robot: left edge (about x4%, y49%), too peripheral.
- Coral fan: inner mint tote, but oversized.
- Blue carp: oversized flat fish banner, not the intended small fabric streamer.
- Green paper frog: spiky/ambiguous folded silhouette, low on the table (about y77%).
- Lucky cat: interior shelf but too large; raised-paw silhouette needs improvement.
- Red crane: bottom bag (about y89%), too peripheral and large.

v5 is one focused corrective edit to bring props inside and reduce their size without changing the scene. No base replacement, personalized rendering, hitbox activation or deployment was performed. No claim that prompt coordinates equal rendered locations.
