# GPT copy implementation — 2026-09-15

## Scope and source handling

The two user-provided GPT documents are overlapping proposals, not two sets of UI changes.
The HTML review contains 590 review units (HE-001–HE-590), **not** a drop-in dictionary.
Mapped the usable proposals onto the existing keys and runtime states. Hebrew is the
source direction; English was adapted to the same product claims and placeholders.

The direction is **״רגע… זה אני שם!״** / **“Wait… that's me!”**.

Implemented across homepage/metadata/navigation/footer, wizard, library/gift/share,
player/replay/collection/album, email and failure states. Unchanged item names,
world/package names, prices, route contracts and generation/progress/payment logic.

## Coexistence with Claude

Fast-forwarded `4ef4ae9` from `claude/collection-design-20260914` before edits.
Retained all his CSS, motion, mobile polish and native ConfirmDialog guarding.
Only copy bindings were changed inside his components. Rechecked his worktree
(clean, still at that commit) before delivery preparation.

## Conditional proposals and deliberate boundaries

- The paid catalog and the private adventure pilot remain distinct. No claim that
  every package includes discoveries/postcards. Collection labels are updated in
  the games which actually include them; rarity IDs and 3/2/1 allocation are unchanged.
- No new public sales activation, checkout/provider changes, prices or release flags.
  QA intentionally remains password-gated with explicitly labelled mock payment.
- Ages 4–10 describe the audience. The existing 2–10 photo-age input remains:
  age in the photo is not a new validation contract.
- Removed fixed universal hide counts and unmeasured playtime estimates from landing.
  Ready emails retain mode-specific 3/5/variable inventory descriptions.
- Kept existing parent/guardian permission. Removed unsupported absolute claims
  about deletion timing, model training, perpetual access or guaranteed likeness.
- Public privacy link is a photo/link/privacy section, not a nonexistent full policy.
- Replay is a temporary visit in the same positions; permanent achievements stay.
  No new earned progress is promised for the temporary replay.
- Save messages distinguish confirmed account save, browser save, pending sync
  and failed local storage. No charge status inferred from a generic error.
- No invented resend/sync operations or unsupported UI states.
- Added specific dialog cancel actions, visible clipboard-failure fallback,
  gift length help, and the correct next-step label when world selection is skipped.
- Existing item hints, artwork and hide coordinates are untouched.

## Verification

- `npm run check -- --maxWorkers=4 --reporter=dot`: 226 files passed;
  3212 passed, 2 expected failures, 35 explicitly skipped.
- Both scene and adventure validators passed. Existing scale warnings remain.
- Added dictionary key/placeholder parity, package next-step and clipboard-retry tests.
- Updated copy assertions without removing dialog-once, progress, replay or album guards.
- Collection test now exercises the full hint-label sequence and terminal disabled state.
- Local browser: Hebrew and English homepage; 390px wizard/button width; name/age
  submission reaches photo step. Synthetic “Copy QA” draft only, no photo or paid render.
- QA deployment/build verification is recorded separately after completion.

## QA schema prerequisite

QA before this delivery was deployment `dpl_HVpEMbpNM1XnQE4dhKcEvjyj1ckx`,
code `71dabd690b3eaf131784672612c7392f8731fc0f`, an ancestor of this branch.
Only Prisma schema difference is the optional AdventureAlbumProgress model.
The table was missing in schema `qa` on Supabase project `find-me`.
Applied migration `qa_adventure_album_progress` using explicitly schema-qualified
SQL: gameId TEXT primary key, revision INTEGER default 0, snapshotJson TEXT,
foreign key to qa.Game(id) with delete/update cascade. Enabled RLS and revoked
anon/authenticated access. Server-only model; no direct client policy.
Verified columns after creation. No production/public table was changed.
Vercel sensitive envs are not downloadable; no secret was reset or made readable.

## Review-unit mapping

The table records the original review IDs for mapped proposals, not an assertion
that every review unit was a separate component or needed a change. Runtime variants
and added labels are reconciled in the dictionaries and tests above.

| GPT review | Existing dictionary key |
| --- | --- |
| HE-173 | `meta.title` |
| HE-174 | `meta.description` |
| HE-002 | `nav.demo` |
| HE-004 | `nav.gift` |
| HE-005 | `nav.pricing` |
| HE-168 | `footer.blurb` |
| HE-170 | `footer.privacy` |
| HE-172 | `footer.terms` |
| HE-011 | `home.hero.pill` |
| HE-012 | `home.hero.title` |
| HE-014 | `home.hero.lead` |
| HE-015 | `home.hero.cta` |
| HE-016 | `home.hero.demo` |
| HE-018 | `home.transform.title` |
| HE-019 | `home.transform.lead` |
| HE-020 | `home.transform.photo.label` |
| HE-021 | `home.transform.photo.text` |
| HE-022 | `home.transform.character.label` |
| HE-023 | `home.transform.character.text` |
| HE-024 | `home.transform.world.label` |
| HE-025 | `home.transform.world.text` |
| HE-026 | `home.transform.photoAlt` |
| HE-027 | `home.transform.characterAlt` |
| HE-028 | `home.transform.worldAlt` |
| HE-038 | `home.how.title` |
| HE-039 | `home.how.steps.0.title` |
| HE-040 | `home.how.steps.0.text` |
| HE-041 | `home.how.steps.1.title` |
| HE-042 | `home.how.steps.1.text` |
| HE-043 | `home.how.steps.2.title` |
| HE-044 | `home.how.steps.2.text` |
| HE-045 | `home.how.steps.3.title` |
| HE-046 | `home.how.steps.3.text` |
| HE-047 | `home.inside.title` |
| HE-048 | `home.inside.tiles.three.title` |
| HE-049 | `home.inside.tiles.three.text` |
| HE-052 | `home.inside.tiles.hints.title` |
| HE-053 | `home.inside.tiles.hints.text` |
| HE-068 | `home.inside.tiles.noFail.title` |
| HE-069 | `home.inside.tiles.noFail.text` |
| HE-056 | `home.inside.tiles.replay.title` |
| HE-058 | `home.inside.tiles.link.title` |
| HE-059 | `home.inside.tiles.link.text` |
| HE-073 | `home.worlds.lead` |
| HE-078 | `home.worlds.next` |
| HE-079 | `home.worlds.prev` |
| HE-107 | `home.gift.title` |
| HE-108 | `home.gift.lead` |
| HE-109 | `home.gift.features.0` |
| HE-138 | `home.gift.features.1` |
| HE-172 | `home.gift.features.2` |
| HE-115 | `home.pricing.title` |
| HE-116 | `home.pricing.lead` |
| HE-117 | `home.pricing.feats.time` |
| HE-134 | `home.trust.title` |
| HE-135 | `home.trust.items.0.title` |
| HE-136 | `home.trust.items.0.text` |
| HE-137 | `home.trust.items.1.title` |
| HE-138 | `home.trust.items.1.text` |
| HE-139 | `home.trust.items.2.title` |
| HE-140 | `home.trust.items.2.text` |
| HE-141 | `home.trust.items.3.title` |
| HE-142 | `home.trust.items.3.text` |
| HE-146 | `home.faq.items.0.0` |
| HE-147 | `home.faq.items.0.1` |
| HE-148 | `home.faq.items.1.0` |
| HE-149 | `home.faq.items.1.1` |
| HE-150 | `home.faq.items.2.0` |
| HE-160 | `home.faq.items.3.0` |
| HE-161 | `home.faq.items.3.1` |
| HE-162 | `home.faq.items.4.0` |
| HE-163 | `home.faq.items.4.1` |
| HE-156 | `home.faq.items.5.0` |
| HE-157 | `home.faq.items.5.1` |
| HE-158 | `home.faq.items.6.0` |
| HE-159 | `home.faq.items.6.1` |
| HE-164 | `home.final.title` |
| HE-165 | `home.final.lead` |
| HE-166 | `home.final.cta` |
| HE-176 | `create.steps.0` |
| HE-178 | `create.steps.2` |
| HE-185 | `create.name.lead` |
| HE-186 | `create.name.label` |
| HE-187 | `create.name.placeholder` |
| HE-188 | `create.name.hint` |
| HE-190 | `create.name.agePlaceholder` |
| HE-191 | `create.name.ageHint` |
| HE-193 | `create.name.tooShort` |
| HE-198 | `create.photo.title` |
| HE-199 | `create.photo.lead` |
| HE-202 | `create.photo.pickHint` |
| HE-203 | `create.photo.pickButton` |
| HE-205 | `create.photo.cropAria` |
| HE-206 | `create.photo.cropLead` |
| HE-207 | `create.photo.confirm` |
| HE-208 | `create.photo.another` |
| HE-209 | `create.photo.hasPhoto` |
| HE-214 | `create.photo.badType` |
| HE-216 | `create.photo.unreadable` |
| HE-217 | `create.photo.failed` |
| HE-217 | `create.photo.network` |
| HE-220 | `create.photo.privacy` |
| HE-221 | `create.package.title` |
| HE-222 | `create.package.lead` |
| HE-224 | `create.package.selected` |
| HE-225 | `create.package.choose` |
| HE-226 | `create.package.next` |
| HE-234 | `create.scenes.lead` |
| HE-238 | `create.scenes.next` |
| HE-242 | `create.checkout.gameTitle` |
| HE-243 | `create.checkout.lead` |
| HE-249 | `create.checkout.total` |
| HE-252 | `create.checkout.emailLabel` |
| HE-253 | `create.checkout.emailHint` |
| HE-256 | `create.checkout.prep` |
| HE-256 | `create.checkout.prepAutomatic` |
| HE-257 | `create.checkout.pay` |
| HE-262 | `create.checkout.cancelled` |
| HE-263 | `create.checkout.declined` |
| HE-267 | `create.mock.title` |
| HE-268 | `create.mock.testHint` |
| HE-270 | `create.mock.fail` |
| HE-271 | `create.mock.cancel` |
| HE-272 | `create.creating.title` |
| HE-274 | `create.creating.lead` |
| HE-275 | `create.creating.milestones.photo` |
| HE-278 | `create.creating.milestones.assemble` |
| HE-279 | `create.creating.milestones.check` |
| HE-287 | `create.creating.heldTitle` |
| HE-288 | `create.creating.heldAction` |
| HE-286 | `create.creating.retrying` |
| HE-291 | `create.creating.backToLibrary` |
| HE-295 | `create.creating.newPhotoButton` |
| HE-301 | `create.creating.readyTitle` |
| HE-302 | `create.creating.readyLead` |
| HE-302 | `create.creating.readyOpen` |
| HE-303 | `create.creating.open` |
| HE-304 | `create.creating.manage` |
| HE-305 | `create.creating.mailNotSent` |
| HE-309 | `create.creating.resend` |
| HE-312 | `create.creating.resendError` |
| HE-313 | `create.creating.resendSimulated` |
| HE-290 | `create.creating.failed` |
| HE-280 | `create.creating.qa` |
| HE-315 | `library.loginLead` |
| HE-316 | `library.emailLabel` |
| HE-318 | `library.sendLink` |
| HE-332 | `library.empty` |
| HE-352 | `library.createMore` |
| HE-166 | `library.createFirst` |
| HE-345 | `library.play` |
| HE-347 | `library.manage` |
| HE-349 | `library.signOut` |
| HE-340 | `library.statuses.QA_PENDING` |
| HE-342 | `library.statuses.NEEDS_NEW_PHOTO` |
| HE-343 | `library.statuses.READY` |
| HE-343 | `library.statuses.DELIVERED` |
| HE-344 | `library.statuses.GENERATION_FAILED` |
| HE-356 | `library.playNow` |
| HE-357 | `library.viewProgress` |
| HE-358 | `library.allGames` |
| HE-362 | `library.share.title` |
| HE-363 | `library.share.lead` |
| HE-367 | `library.share.send` |
| HE-369 | `library.share.shareText` |
| HE-370 | `library.share.rotate` |
| HE-378 | `library.gift.title` |
| HE-379 | `library.gift.lead` |
| HE-382 | `library.gift.fromPlaceholder` |
| HE-383 | `library.gift.message` |
| HE-385 | `library.gift.messagePlaceholder` |
| HE-394 | `library.remove.lead` |
| HE-393 | `library.remove.confirm` |
| HE-395 | `library.remove.button` |
| HE-398 | `library.deleted` |
| HE-519 | `play.invalid` |
| HE-521 | `play.revoked` |
| HE-523 | `play.notReady` |
| HE-518 | `play.heading` |
| HE-530 | `notFound.lead` |
| HE-405 | `game.gift.open` |
| HE-415 | `game.scene.findChild` |
| HE-420 | `game.scene.findChildAgain` |
| HE-431 | `game.scene.unlockRemainingOne` |
| HE-432 | `game.scene.unlockRemaining` |
| HE-434 | `game.scene.allHidesFound` |
| HE-433 | `game.scene.unlocked` |
| HE-436 | `game.scene.keepSearching` |
| HE-429 | `game.scene.loadRetry` |
| HE-505 | `game.replay.label` |
| HE-515 | `game.replay.complete` |
| HE-467 | `game.album.title` |
| HE-480 | `game.album.postcardRemainingOne` |
| HE-481 | `game.album.postcardRemaining` |
| HE-482 | `game.album.postcardEarned` |
| HE-492 | `game.album.saving` |
| HE-493 | `game.album.savedAccount` |
| HE-502 | `game.album.guest` |
| HE-496 | `game.album.unsaved` |
| HE-446 | `game.collection.stopSeeking` |
| HE-445 | `game.collection.listen` |
| HE-450 | `game.collection.complete` |
| HE-477 | `game.collection.seekInBoard` |
| HE-454 | `game.collection.rarity.common` |
| HE-455 | `game.collection.rarity.rare` |
| HE-456 | `game.collection.rarity.epic` |
| HE-193 | `errors.NAME_TOO_SHORT` |
| HE-192 | `errors.NEED_NAME` |
| HE-196 | `errors.INVALID_CHILD_AGE` |
| HE-230 | `errors.PACKAGE_UNAVAILABLE` |
| HE-229 | `errors.PICK_PACKAGE_FIRST` |
| HE-241 | `errors.SCENE_UNAVAILABLE` |
| HE-255 | `errors.INVALID_EMAIL` |
| HE-215 | `errors.TOO_LARGE` |
| HE-214 | `errors.BAD_TYPE` |
| HE-216 | `errors.UNREADABLE` |
| HE-217 | `errors.UPLOAD_FAILED` |
| HE-573 | `email.magic.subject` |
| HE-574 | `email.magic.title` |
| HE-575 | `email.magic.body` |
| HE-576 | `email.magic.button` |
| HE-577 | `email.magic.ignore` |
| HE-580 | `email.ready.subject` |
| HE-583 | `email.ready.button` |
| HE-586 | `email.ready.manage` |
| HE-578 | `email.footer` |

