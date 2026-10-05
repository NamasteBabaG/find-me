# Worlds and friends polish: independent QA

Reviewed Claude's `b5fff01d` and `fd0f1019` above the published `6998af78`
release. Integrated them by fast-forward in the release checkout. The primary
checkout and Claude's checkout were not edited.

## Captured flow and findings

1. **Pricing — passed local QA policy.** One first-world offer and one
   continuation offer show 39 / 30 ILS in Hebrew and English. At 320px the
   offer stacks without horizontal overflow. The only purchase link is the
   first-world CTA while the QA policy excludes bundles. Currency and eligibility
   still come from the existing domain policy; this is a presentation change.
   Captures: `04-pricing-desktop.jpg`, `05-pricing-mobile.jpg`,
   `06-pricing-mobile-offer.jpg`.
2. **Child's world card — found and fixed an edge hit-area defect.** Claude's
   stretched link inherited the button's 999px pill radius. At desktop, a real
   click 24px inside the card's upper body corner did nothing. The cover now
   uses the card's 32px radius; that same click opens the world. A 390px check
   also resolves the edge to the play link. Management enters the management
   page, and the friends action opens its own dialog and closes normally.
   The map retains its aspect ratio and the full world title is visible. There
   is one gameplay tab stop; the visual map link is hidden from accessibility
   and has tabIndex -1. Captures: `01-child-before.jpg`, `11-child-mobile.jpg`.
3. **Collection and mixed languages — passed.** With an English game inside
   an RTL site, the bag's x-coordinate is 310px before and after opening at
   390px width. The tray measures 320px, with clientWidth = scrollWidth; all
   six names/pictures remain visible. The game uses LTR, including its forward
   arrow, while the site's direction remains RTL. Enlarging a picture and
   pressing Escape restores focus to the thumbnail and preserves the selection.
   A physical drag hides/inerts collection/HUD/sound, leaves the map available
   and records no find. Captures: `13-mixed-language-tray.jpg`,
   `14-magnifier-mixed.jpg`, `15-pan-mixed.jpg`.
4. **Completion and passport finale — passed measured layouts; simplified popup.**
   At 320x460, Stay previously wrapped into three cramped lines beside two
   icons. The live-game short layout now has Next + map on row one and Stay +
   replay on row two. Stay takes two lines. A map primary spans the first row,
   without adding a duplicate map icon. No-Stay behavior
   is retained. After Guy's follow-up, the popup uses the same destination
   illustration as the homepage, with just the place name underneath. Its
   postcard preview and adventure prose are removed; actual passport memories
   retain their photographs. Visible action skins are 48px high inside real
   64px touch boxes. The child-size invariant exposed an ambiguous grouped
   min-height rule; word/button sizing is now explicit and its 21 focused
   size/navigation tests pass. At 320x460 the updated card spans y=32..428 and Stay has
   a 184x64px box. A real click in Next's transparent upper edge opens the next
   board directly, confirming the full touch area is live. Completion was
   remeasured at 320x460, 320x568, 360x640, 375x553,
   375x667, 390x664, 390x844, 1024x768 and 1440x900: no document overflow and
   all action targets at least 64px. The actual newly earned final passport
   page was checked at those phone sizes plus 1024x768; its three actions
   remain 64px high and in view. Replay's Next opens the next painting directly.
   Captures: `02-completion-before.jpg`, `18-completion-emblem-mobile.jpg`,
   `19-completion-emblem-short.jpg`, `10-finale-320x460.jpg` and `finale-*.jpg`.
5. **Desktop mission — passed.** At 1440px, the long English mission with
   “Test Explorer” is one 24px line in a 394px-wide card, clear of the tools
   and bag. The measured compact-frame rules retain precedence. Capture:
   `09-desktop-hud.jpg`.
6. **Sharing — passed local flow; fixed asynchronous stale feedback.** Hebrew
   and English display a named ticket, without a raw player URL. Copy displays
   its acknowledgement. Canceling replacement keeps the link. Two actual local
   replacements each invalidate the preceding link; the new link opens the gift.
   Share/copy/replace are disabled while replacement is pending. A delayed old
   clipboard success or failure can no longer overwrite the new ticket's state;
   generation/current-URL guards also clear stale timers and handle unmounting.
   Current-link manual-copy fallback is retained. Clipboard writes already in
   flight cannot be revoked; they are not falsely acknowledged on the new ticket.
   Captures: `08-share-ticket-en.jpg`, `12-share-he.jpg`.
7. **Public homepage demo — functional pass, final visual capture limited.**
   Played its three public-art hides, replayed through its actual finale action,
   and found all three again. The completion dialog and its actions appeared in
   the accessibility tree. Scoped the new <=600px live tier away from demos;
   the demo's star text remains displayed. Repeated screenshot/input timeouts
   prevented accepting a final demo screenshot. One measurement caught the
   card at the existing animation's initial scale(.6), opacity 0, rather than a
   proven settled layout. Source comparison confirms that 600ms entrance
   animation predates this round; no persistent undersized demo control or new
   application hang is claimed. Making the browser visible remounted the public
   demo and reset its ephemeral progress. Final demo visual/Safari verification
   remains a limitation, not a fabricated pass.

## Verification and limits

All browser work used an isolated local SQLite fixture, synthetic profiles,
public demonstration artwork and mock providers with generation disabled.
No private QA game/images, paid provider, customer photo, email delivery,
purchase or generation was accessed. The added finale fixture was seeded
through the album service, then its final target was found through the UI.
Its board names/crops intentionally reuse synthetic demonstration data and
are not evidence of generated-art quality. Source assets, scene contracts,
all required hides, $5 budget, pricing arithmetic and payment rules are unchanged.

The additional fixes touch only the family card CSS, ManageGame and its
tests, and completion markup/CSS/tests. Focused checks include 14 sharing,
41 completion/navigation, six new HE/EN action cases and preservation of
actual passport imagery. The final full check passed 346 files and 4,389
tests, with two expected failures and 55 skips, exit 0. The local build and
private-asset audit passed, with no private leaks or tracing problems.
Exact CI/deployment/alias results are recorded in
ignored release evidence before publication.

Accepted captures and measured JSON are under ignored
`output/claude-round-audit/`. Rejected/loading/cropped captures are not used as
proof. Browser dimensions are not physical-device checks. Native iPhone/Android
share sheets, Safari, real-device clipboard readback and audible audio were not
verified. Clipboard readback in this browser was unreliable; outgoing payloads,
failure fallback, cancellation and delayed results are covered by focused tests.

Temporary browser tabs were closed, viewport/visibility overrides restored and
the mock development server stopped before the full release checks. QA
publication requires a clean pushed commit, successful exact-commit CI, a READY
deployment in dedicated find-me-qa, remote privacy audit and alias verification.
