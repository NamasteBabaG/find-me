# Night Carnival v1 — lantern parade

2026-09-18. User approved this art ("אחלה מעולה הבורד הבא") after approving Sweet Workshop v3. Not activated in the game or deployed to QA; mapping and playtest remain open.

## Receipt

- Master: `output/imagegen/magic-nightcarnival-v1-lantern-parade.png`
- Verified dimensions: 3840 × 2160 PNG, 17,100,129 bytes. Native requested output; no post-generation upscaling.
- SHA256: `7a983289be6a1fd54deef8bce406d10ba8c115f3503ff7c3d256ed73f167483f`
- Prompt: `docs/art/magic-nightcarnival-v1-lantern-parade.prompt.txt`
- Style-only input: `tmp/imagegen/magic-dimensional-faces-style.png`, 1000 × 850 crop from the approved castle master.
- Input SHA256: `e8cc2f2477f287e8c592837a82ccb043d2022c09de545cbedc56ac04bc7c5d70`
- Route: bundled Imagegen CLI, existing authorized OpenAI API key, `gpt-image-2`, high quality, n=1. New composition using style reference through the image edit endpoint.
- One successful call, 127.6 seconds. Exact billed cost was not returned by this CLI run.
- No child photo, personal hiding spot, live target ID, runtime asset, catalog entry or deployment changed. Previous masters remain untouched.

## Visual review

Viewed the whole master and nine unscaled inspection crops under `output/imagegen/magic-nightcarnival-v1-inspection/`.

The scene reads as a night carnival: a large tethered whale lantern, warm illuminated carousel, small trains, a puppet dragon, shadow theatre, a magician pulling a striped sock beside a rabbit, a balloon dachshund, an animal-lantern procession with a peacock, ribbon dancers and a wind-up toy helper. Many children and adults fill the tiers; an exact population count was not performed.

The blue/lilac sky fill and amber lamps create a distinct evening identity. The setting is noticeably darker than the daytime boards, but the central faces and objects remain readable in the inspected image. No global clarity or brightness adjustment was applied. The user should judge the evening balance in the full-board view.

Sampled faces have modeled cheeks/noses, varied hair and expressions; there is no broad smearing in the inspected crops. Cloth remains more matte than lamps and metal props. Background crowd faces are simplified at their smaller scale. This is not a guarantee of perfect anatomy in every small figure.

Composition caveat: the railings divide activities into fairly regular horizontal strips, more stage-like than the intended organically interlocking fairground. Foreground people are larger than the planned 14%-height limit. The result is populated and shallow, but not exact compliance with every composition instruction.

## Six discovery candidates verified in pixels

Positions below are approximate object centers measured by visual inspection of the final image. They are NOT production `visibleRect`/`hitRect` values or verified HUD safety.

| Rarity | Actual object | Approximate center | Evidence and caveat |
| --- | --- | --- | --- |
| Common | Red clown nose / אף ליצן אדום | x31%, y50% | Red rounded cup with opening on makeup table; `nose.png`. Card/hint should show the opening so it is not confused with a red juggling ball. |
| Common | Striped juggling club / אלת ג׳אגלינג מפוספסת | x49%, y49% | One red/cream bulbous club and narrow handle, fully visible; `club.png`. |
| Common | Turquoise toy trumpet / חצוצרת צעצוע טורקיז | x70%, y49% | Flared bell and curled tubing on purple cloth, fully visible; `trumpet.png`. |
| Rare | Lilac moon mask / מסכת ירח לילכית | x23%, y66% | Crescent form, openings and ribbons on costume table; `moonMask.png`. Left of the intended inner band, though not at the frame edge. Requires HUD check. |
| Rare | Red-and-gold toy rocket / טיל צעצוע אדום־זהוב | x54%, y70% | Pointed body, red fins and round window; `rocket.png`. Body is warm gold/tan rather than requested silver tin. Do not label its material as silver tin without revision. |
| Epic | Silver star token / אסימון כוכב כסוף | x66%, y69% | Round silver coin with raised five-point star on plum tray; `token.png`. Clear and fairly exposed, so Epic is an intended collection tier, not proof of high difficulty. |

All six are recognizable candidates, but uniqueness, tap geometry, card crops and difficulty have not passed an interactive playtest. Other round red juggling balls exist; the nose's opening/context must be retained in the discovery crop. Several targets shifted downward from their requested coordinates. No coordinates were silently copied from the prompt into game data.

Additional inspection crops: `faces.png`, `lantern.png`, `dance.png`. All inspection crops are extraction-only; the master is unchanged.

## Next boundary

Art feedback is now positive. The user requested the next board, so new art production proceeds to Dinosaur Valley in the Time Travel catalog. Still required for Magic: finish discovery selection and mapping across all six new boards, verify desktop/mobile HUD and zoom, and only then author protected personal hiding spots and test the full world. This sixth image completes the first art pass of the planned six additions, not a playable nine-board Magic release.
