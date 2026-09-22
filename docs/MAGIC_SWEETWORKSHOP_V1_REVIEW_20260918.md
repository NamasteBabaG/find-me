# Sweet workshop v1 — close-view draft

18 September 2026. **Internal draft retained, not presented for approval and not gameplay-ready.**

## Receipt

- User approved cloud city and requested the next planned board, sweet workshop.
- Prompt: `art/magic-sweetworkshop-v1-candy-invention-kitchen.prompt.txt`.
- Input: style-only `tmp/imagegen/magic-dimensional-faces-style.png`, the native 1000x850 castle v18 crop at left 1500/top 690. No private child image.
- Existing authorized key, bundled Imagegen CLI, `gpt-image-2`, high, n=1, 3840x2160. Images API edit endpoint used for a style reference.
- One successful API call, 117.6 seconds.
- Master: `output/imagegen/magic-sweetworkshop-v1-candy-invention-kitchen.png`.
- Verified PNG **3840x2160**, 15,639,194 bytes. No upscale.
- SHA-256: `21c95d0d92b3d5e5bbb823c00b4ee0ba51c8404ea9f1d5ddd02701a21b1395ce`.
- Native inspection crops for cutter and bunny: `output/imagegen/magic-sweetworkshop-v1-inspection/`.

## Internal visual review

The kitchen has coherent mint/strawberry/cream indoor styling, readable faces and hands, a smiling mixer, gingerbread helpers, taffy, chocolate cascade, pastry carousel, train cake, wrapping and cupcake activities. Materials and soft window/pendant lighting are differentiated. However, framing is too close: roughly two dozen people rather than the intended 40-plus, large foreground heads, and oversized target props. The back mezzanine is effectively empty. This conflicts with the user's repeated requirements for a zoomed-out, populous board.

All six concepts are visible, but not all are valid targets:

| Concept | Approximate center | Actual observation |
| --- | --- | --- |
| Spiral lollipop | x24%, y50% | Clear, conspicuous and slightly too far left for the conservative target zone. |
| Turquoise whisk | x35%, y25% | Clear but too high. |
| Star cutter | x57%, y41% | Native crop shows a rounded flower-like hollow outline rather than unambiguous sharp five-point star. |
| Purple piping bag | x39%, y59% | Clearly drawn with nozzle on middle counter. |
| Bunny biscuit | x46%, y92% | Native crop shows a standing 3D bunny pastry sculpture, not the requested flat biscuit, and it is at the bottom edge. |
| Gold heart candy | x69%, y92% | Recognizable heart foil and twisted ends, but large and at the bottom. |

Coordinates are inspection notes, not production hitboxes. No catalog/scene activation, collection cards, personalized hides or QA deployment occurred.

## Focused second attempt

An additional composition pass within this board task was started to correct the known framing/density mismatch before delivery. The user was told the first view was too close. v2 asks for the old scene to sit within the center of a wider seamless kitchen, with additional activities around it, small/medium figures, and the old foreground targets pulled into the new interior. It also requests a true pointed star cutter and a flat bunny biscuit. The exact scale and locations remain prompt guidance, not proof of compliance. v1 remains unchanged for comparison.
