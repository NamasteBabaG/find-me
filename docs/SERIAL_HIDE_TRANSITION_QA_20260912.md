# One hide at a time — 2026-09-12

## Corrected requirement and cause

The five-hide upgrade displayed all five appearances simultaneously. Finds
saved stars and completed their popup, but deliberately left the found child
painted on the board. The previous acknowledgement/marker patch therefore did
not solve the user's requested disappearance and next-hide transition.

Five saved targets, three-star unlock and a 45-star world remain unchanged.
Only one unfound appearance is now drawn and hit-tested at a time. The found
appearance stays for the 2200ms celebration; clouds close, the patch swaps at
560ms, the camera resets immediately while covered, and clouds reopen 160ms
later. Input cannot award a hidden next target during that turn. The fifth
appearance survives its celebration, then disappears before the completion
card. All five assets are preloaded, so swapping needs no generation request.

Saved target IDs, scene versions, replay variants and progress storage are
unchanged. All 32 subsets of saved five-hide progress select only the next
unfound appearance. Original board art and patch/hit geometry are unchanged.

## Verification before deployment

- `npm run check -- --maxWorkers=2`: exit 0; 170 files, 2478 passed, 35 skipped.
- Actual viewport, pointer, RAF and store tests cover desktop and portrait
  mobile: five consecutive finds, single popup/particles, covered swap,
  no hidden awards, third-star unlock and fifth completion without stuck clouds.
- Real motion-enabled test requires the reset complete at the swap, while the
  curtain is still closed. Toolbar reset keeps its existing animation.
- Independent read-only review and focused tests passed; no remaining blocker.
- Local browser: Paris 0 to 5 via five real clicks with no reload; each target
  removed and replaced by a different single target. Third star exposes the
  choice to continue or stay. Fifth opens the completion card with zero target
  images. World progress 6 to 11, then next board Marrakech opens at 0/5.
- No browser runtime errors. Existing development-only Next image
  localPatterns forward-compatibility warning remains unrelated.

QA live gameplay verification initially requires the user to renew the QA
access cookie. Deployment and live observations are recorded separately below;
local synthetic verification is not described as verification of that cookie
or the live personalized game.

No artwork purchase, identity regeneration, new game or progress reset.
