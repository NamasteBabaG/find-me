# Independent recheck of the board-paint release `6b3d9aec` — 24 September 2026

**Reviewed:** the released SHA `6b3d9aec4b5a839df35fc61a1bfa5585108e49ad` on `codex/independent-worlds-20260918`
(three commits over the previous release `f673f8a7`: `82ca18c9` docs, `22ba8453` bound passport finale, `6b3d9aec` v12 recipe).
Codex's implementation worktree was not used; the clean checkout `work/qa-board-paint-release-20260924` was read and never
modified (0 status lines before and after).
**Method:** read-only. Every executed check ran in my own detached worktree `work/claude-audit-20260924` at `6b3d9aec`
(`npm ci`, deleted afterwards) with synthetic providers, a disposable SQLite database and the fictional beach demo. No
deployment, migration, payment, paid render, e-mail or credential. The QA password was neither known nor sought. No private
child art was opened, including the approved dragon-stool reference.

## הכרעה (Hebrew summary for Guy)

**המנוע והפריסה מאושרים ל־QA כפי שדווחו; שני דברים צריכים תיקון לפני שמרנדרים בכמות או מציגים את הדרכון החדש
להורים על מחשב נייד, ואחד דורש החלטה.**
1. **אין אף דוגמה אמיתית של v12 (F-A).** התמונה שאישרת הופקה בשני שלבים בכלי עריכה על ילד שכבר הוצב; המתכון במנוע
   הוא מעבר אחד שגם מציב וגם צובע, עם פרומפט אחר. הבריף מבקש להשוות דוגמאות בתשלום לרפרנס בגודל טבעי, ואין כאלה.
   לפני כל רינדור בכמות: דגימה מוגבלת (למשל שלושת המחבואים של מערת הדרקון במשחק ההוכחה המקומי, ניסיון אחד לכל אחד),
   ואז בדיקה בהקשר. הערותיי לפרומפט עצמו בסעיף 4.
2. **הדיאלוג של סיום הלוח גבוה ממסך של מחשב נייד (F-C).** ב־1366×620 (עברית) שלושת הכפתורים מתחת לקו המסך; ב־1366×700
   (אנגלית) הקישור לדרכון מתחת לקו; ב־360×640 עם תוויות אנגליות ארוכות — גם. אפשר לגלול את הדיאלוג, אבל שום דבר לא מראה
   שיש עוד. קודקס מדד ב־1366×768 ו־360×740/640 בעברית, ובין 640 ל־768 גובה, שם חיים המחשבים הניידים, לא נמדד.
3. **בלוח האחרון של משחק בלי עולמות, "כל העולמות" מוביל למסך ריק (F-D, קיים מלפני השחרור).** "0 מתוך 0 עולמות
   הושלמו" ורק כפתור דרכון. במשחקים עם עולמות זה לא קורה; במשחק איים ישן כן.
4. **הנעיצה של גרסת הפרומפט לא מחייבת (F-B, נמוך).** היא קובעת רק "v12 או לא"; מה שנקנה בפועל נגזר מגרסת הסצנה, ואחרי
   רכישה שהצליחה השורה מסומנת מחדש לפי מה שנקנה. בנתונים אמיתיים אין פער היום, אבל החוזה "שורה שמורה שומרת את המתכון
   שלה" מתקיים במקרה, לא בכוח.
אומת עצמאית: ה־CI האמיתי (267 קבצים, 3,449 בדיקות בלינוקס, סביבת ה־mock רק בשלב הבילד), ה־alias, ביקורת הפרטיות בבילד,
מקור הפריסה לפי בייטים, המנוע דרך הרץ האמיתי עם מתאמים סינתטיים (v12 מגיע לצייר ונשמר; שורה היסטורית נשארת v11 בשני
הניסיונות; רכישה שמורה חוזרת בלי קריאה לספק), והדרכון בסיום הלוח בעברית ובאנגלית: תנועה מופחתת, השתקה, שמירה מעוכבת,
שמירה שנכשלת, קריאת דרכון שנכשלת עם "מנסים שוב", והלוח האחרון. 54 ההופעות הקיימות לא נכתבות מחדש — מבנית, בקוד;
את מסד ה־QA עצמו לא בדקתי.

---

## 1. Verdict

**Engine and deployment: confirmed as released; not a go-ahead for bulk rendering.** Two items to fix before the new finale
meets parents on laptops or the recipe meets the provider at scale (F-A, F-C), one pre-existing navigation gap (F-D), one
design fragility with a reproduction (F-B). Nothing reopens the gates already listed as open.

## 2. What was executed vs. inspected

| Check | Executed / inspected | Result |
| --- | --- | --- |
| GitHub run 36028856674 via authenticated `gh api` | executed | push of `6b3d9aec`, ubuntu-latest, all steps green; the check step's env is `APP_COMMIT` + `NEXT_TELEMETRY_DISABLED` only, the build step alone carries `APP_ENV: development` / `PAYMENT_PROVIDER: mock`; **267 files, 3449 passed, 2 expected fail, 35 skipped, 535 s**; audit `status: pass`, `privateLeaks: []`, `problems: []` |
| Vercel: deployment, aliases, source tree, one source file | executed (read-only connector) | `dpl_Hn5SnRX5bhNx8rx95qrEsEuTU2Mj` READY, target production, `source: cli`, region iad1; `qa.findmeworlds.com`, `find-me-qa.vercel.app`, `find-me-qa-smallheroes-projects.vercel.app` all → this deployment; **`meta` is `{}` through the connector** (Codex's `meta.gitCommitSha`/`releaseCommit` claim not reproducible here); the uploaded tree holds `docs/BOARD_PAINT_ENGINE_QA_20260924.md` (first exists at `6b3d9aec`) whose first 1,500 bytes equal the released file byte-for-byte; no `.env`, `smoke-fixture.json` or `local-preview.json` in the tree |
| Codex's five suites (board-paint, hide, render, identity-reuse, passport-completion) in my worktree | executed | 5 files, **81/81** |
| My own runner probe (`tmp-claude-board-paint-probe.test.ts`, real `runLocalPatchHide`, synthetic painter/judge, disposable SQLite) | executed | **5 passed, 1 failed by design** — the failure is the reproduction of F-B |
| Completion passport replay, Hebrew owner session (boards 3→9, real taps, dialog measured) | executed (headless Chrome, released SHA on a local dev server, mock providers) | 17/19 — failures are F-C (1366×620) and F-D (last board) |
| Completion passport replay, English (boards 3→9, eight viewports, wheel probe) | executed | 16/21 — failures are F-C (1366×700/650/620, 1280×600, 360×640) |
| Reduced motion, mute, delayed save (7 s hold), failed save, failed passport read + retry, final-board navigation | executed | all behave as claimed (§5) |
| Real-provider samples of v12 vs the approved reference at native size | **not executed** | none exist; rendering not authorized; the reference image is private child art and was not opened |
| Live authenticated QA game / health | **not executed** | behind the QA gate (as before) |
| The QA database (54 appearances, 108 discoveries) | **not inspected** | no access; "untouched" is verified in code (§5), not in data |

## 3. Findings, by severity

### F-A — MEDIUM (release readiness): v12 has no real-provider sample, and the approved reference was made by a different recipe

`docs/passport/BAR_STYLE_AND_COMPLETION_20260924.md:5,52-57`: the approved proof was produced by **two built-in
image-generation edits** whose prompt takes **Image 1 as the edit target with the child already placed and grounded** and
repaints only skin and hair. The engine's v12 (`local-patch-prompt.ts:207-232`) is a **single pass** that must place the
child from Image 2, size it, ground it *and* paint it, with the crop of the board as the only paint reference. The handoff
itself says "the approved image is a visual reference, not evidence that every image generated by this revised prompt will
pass" and "no paid generation API runner was used". So the brief's item 3 — compare actual paid samples with the approved
reference — cannot be done: there are no samples. Recommending bulk generation on this evidence would be wrong.

**Smallest next step (needs your authorization, costs money):** one bounded real-provider sample — the three dragon-cave
hides of the local proof game, one attempt each, through the real runner so the judge and the receipts apply — then a
contextual review at native size before anything else is rendered. Acceptance: the judge passes without `styleMatch`
uncertainty and a human agrees the face is board-painted without age drift.

Prompt review notes are in §4.

### F-B — LOW (design fragility, reproduced): the pinned prompt version is not the version that gets bought

`local-patch-hide.ts:246-247` pins `promptVersion` from the existing row, but passes it on only as
`paintRecipe: promptVersion === v12 ? "board-paint-v1" : undefined` (`:330`). `local-patch-render.ts:293-299` then decides
the wording from `input.contentVersion` (scene-derived) unless `paintRecipe` is set, and on success `local-patch-hide.ts:429`
writes `attemptResult.promptVersion` back to the row.

Reproduction (my probe, real runner): a row stamped `v11-canonical-portrait-only` on a scene of version 5 is bought under
the **v6** wording (`localPatchPrompt(...)` without recipe, exact equality); after a lost write the retained purchase
replays with zero provider calls, and the row is **relabelled `local-patch-prompt/v6`**. The same row after two *refused*
attempts keeps `v11` (the failed branch does not write the column). Codex's tests pass because they only assert
`not.toContain("PAINT AUTHORITY")` and use scene-consistent versions.

Live impact: none found — every stored version was written by the previous release from the same scene-derived rule, so
stored and derived agree. But "a retained row keeps its original recipe across retries" (`local-patch-prompt.ts:65`) is
true by coincidence, not by contract. **Fix:** derive the recipe from the pinned version explicitly (a version→recipe
table), and refuse or hold for an operator when `promptVersionOf(input) !== pinned` before any purchase; add a test with a
stored version that disagrees with the scene-derived one. Acceptance: the row's `promptVersion` is unchanged after every
outcome (generated, replayed, refused).

### F-C — MEDIUM (UI): the bound finale is taller than a real laptop viewport, and nothing says it scrolls

Clean first-paint measurements of `dialog.passport-finale` (before any scrolling), owner session, six items collected:

| viewport | inside top/bottom | dialog scroll gap | out of view |
| --- | --- | --- | --- |
| 1440×900 | 73 / 827 | 0 | — |
| 1366×768 | 15 / 753 | 0 | — |
| 1366×700 (en) | 12 / 751 | 63 px | passport link |
| 1366×620 (he) | 12 / 751 | 143 px | **all three actions** (next, stay, passport) |
| 390×844 | 74 / 770 | 0 | — |
| 360×640 (he) | 22 / 618 | 0 | — |
| 360×640 (en, long labels) | 12 / 661 | 33 px | passport link |

The dialog element scrolls (UA `overflow: auto`; a wheel brings every button into view, verified), but there is no
affordance, the `.passport-finale__inside` is `overflow: hidden`, and the primary "next place" button is below the fold on
any desktop viewport under about 640 px tall — which is what a 1366×768 laptop shows with a browser toolbar and the
Windows taskbar. Codex's matrix (`BAR_STYLE_AND_COMPLETION_20260924.md:41`) used 1366×768 and 360×740/640 in Hebrew; no
desktop height between 640 and 768 and no English 360×640.

**Fix:** for `(min-width: 601px) and (max-height: 720px)` shrink the memory (`--memory-aspect` width from `min(300px,
40dvh)` to `min(240px, 32dvh)`), trim leaf padding and the header margin, or stack the two leaves; for English at 360×640
let the long labels wrap to two lines within a fixed row height. Add 1366×650 and 1280×600 to the measured set, in both
languages, and assert `dialog.scrollHeight === dialog.clientHeight`. Acceptance: no action below the fold at 1366×650 in
either language.

### F-D — LOW (pre-existing): the last board's "All worlds" sends a game without worlds to an empty hub

`PassportCompletion.tsx:129`: on the last board the primary action is `store.goToWorlds`. `WorldHub.tsx:26-27` says "a
one-world game never sees this", and `GameShell.tsx:97` hides hub navigation unless `multiWorld`. Replayed on the beach
demo fixture (an island game, no world map) in both languages: after board 9 the child lands on "Where shall we go, Noa? —
0 of 0 worlds completed" with only the passport button; no way back into the game except the browser. Not introduced by
this release (the line is unchanged), and games with a world map show their world here; but every legacy island game and
every one-world game gets a hub it was never meant to see. **Fix:** `next ? openScene(next) : gameWorlds(config).length > 1
? goToWorlds : goToMap`, and let `WorldHub` fall back when it has no rows. Add a one-world completion test.

### F-E — INFO: release identity in Vercel metadata is not visible through the connector

`get_deployment`/`list_deployments` return `meta: {}` for both this deployment and the previous one, so "Deployment API
`meta.gitCommitSha` and `meta.releaseCommit` both match" could not be reproduced here. Provenance was established from the
uploaded tree instead (§2). If Codex read `meta` through the CLI or REST with a token, note the tool in the receipt.

## 4. Prompt review (v12 `boardPaintPrompt`, `local-patch-prompt.ts:207-232`)

Read against v11 (`portraitOnlyAgePrompt`, `:266-289`) and the approved proof prompt. Not a sample review — see F-A.

- **Identity drift.** "IDENTITY AUTHORITY: Image 2 … skin identity" and "PAINT AUTHORITY … repaint the child's skin"
  pull in opposite directions on one word; say "skin tone from Image 2, brush handling from Image 1". "Never borrow a
  neighbour's features, hairstyle or age" and "no compulsory camera-facing pose" are good; but v11's "the complete face and
  characteristic hair must remain readable" is gone, while the judge still fails `faceReadable`
  (`local-patch-judge.ts:184-188`). Expect more refusals on natural three-quarter poses; add "both eyes visible" or accept
  the retry cost knowingly.
- **Texture strength.** The anti-mosaic / anti-noise / "take the amount of texture from the board" clauses are the right
  guard. The risk is the other way: "warm/cool painted planes on forehead, temples, cheekbones, nose sides, cheeks and
  chin" is adult anatomy vocabulary and can age a five-year-old; `canonicalAgeDirection` says "without maturing the jaw"
  once. Add one clause: "child anatomy — soft rounded planes, no adult cheekbone or jaw definition".
- **Paint reference availability.** In v10 (`isLocalPatchAgeVersion`) there are only two images, so the paint authority is
  whatever painted people happen to be inside the 512×768 crop. A hide whose crop holds no face (a corner, a distant
  bench) has no face-paint reference at all and will fall back to the portrait's smoothness. Bulk rendering needs either a
  crop check (at least one painted face in the crop) or an explicit exception list.
- **Scale and furniture contact.** "Feet rest on the authored ground, not through a stool rail … preserve furniture edges and
  load-bearing surfaces", the standing-height envelope, "not a reason to miniaturize" and "correct whole-body proportions"
  are all present and clearer than v11. The contact shadow is now implicit ("plausible contact and occlusion"); v6 said it
  outright. Say "paint the local contact shadow where feet or knees meet the ground".
- **Fit.** v11's "add no unrelated people or animals" became "preserve other people, animals and discovery objects"; the
  explicit prohibition on *adding* anything but the one child should return.
- **Repairs.** `BOARD_PAINT_REPAIR_DIRECTIONS` covers every check (`satisfies`); `faceLikeness` and `styleMatch` are the
  right two rewrites. Confirmed that a historical v11 row never receives them (§5).

## 5. What passed independently

- **F1-style CI environment**, alias, build audit, provenance: §2.
- **Engine, through the real runner with synthetic adapters** (my probe + Codex's suites): a new row receives exactly
  `localPatchPrompt({…, paintRecipe: "board-paint-v1"})` — the v12 header, the parent-confirmed age line, none of the v6/v11
  wording — and `promptVersion` v12 is persisted; the adapter receives no new field. A historical `v11` row is bought under
  the legacy wording on attempt 1 **and** attempt 2 (legacy recipes add repair text only on the world's final pass,
  `local-patch-hide.ts:278-280`), never `PAINT AUTHORITY` / `PAINT REPAIR`, and stays `v11`, attempts 2, FAILED. A row with
  no provenance is bought under the legacy wording. A retained purchase (lost write after the provider answered) replays
  with **zero provider calls** under both recipes (`replayed: true`, attempts 1, GENERATED). A generated row is not bought
  again (`already-generated`, no dispatch). Codex's render-level test shows a v11 retained purchase refuses a v12
  fingerprint (`refusedBecause: "stopped"`, no dispatch) — the charged operation cannot change silently.
- **Historical callers**: `renderLocalPatchHide` selects v12 only with an explicit `paintRecipe` (`:293-299`); scripts and
  the identity-reuse path that go through the runner get v12 for new rows only, as documented.
- **Completion passport (he + en, owner session, real taps):** stamp ceremony title, six items or six "?" placeholders,
  two numbered leaves (folios 5/6 on desktop, the memory folio hidden on phones), stamp visible, account save acknowledged
  ("נשמר בדרכון שלכם" / "Saved to your passport"); reduced motion → `data-phase="settled"` at once, no celebration
  overlay; mute toggles ("השתקה" → "הפעלת צליל") and no audio errors; a save held for 7 s shows the saving copy first, then
  the acknowledgement; a failed save shows "הסנכרון לא הושלם. השמירה בחשבון עדיין לא אושרה." with all actions usable; a
  failed passport read shows "לא הצלחנו לפתוח את הדרכון כרגע. ההתקדמות שלכם לא אופסה." with "מנסים שוב", and the retry
  recovers to the saved state; the primary action closes the dialog and opens the next board; no console errors in either
  language. 1440×900, 1366×768 and 390×844 fit with every control ≥48 px (main actions 64 px).
- **Delivered games untouched (item 5):** verified in code, not data — the recipe applies to rows that do not exist yet
  (`pinnedLocalPatchPromptVersion(null, …)`), existing rows keep theirs, the release contains no migration, no data script
  and no job that iterates rows; deploying code runs nothing against the database. Neither handoff claims re-rendered
  appearances; both say the 54 are unchanged and that the repaired third dragon lives in a separate local proof game.

## 6. Not verified here

Real-provider output of v12 (F-A); the live QA game, passport and health behind the gate; the QA database rows; Vercel
`meta`; the 181.11 MB function figure; the approved reference image itself (not opened).

## 7. Housekeeping

The probe test, the two fixture helpers and the review fixtures lived only in my worktree, which is deleted; screenshots and
JSON results are in my scratchpad, not in the repository. Codex's implementation worktree was not touched except for this
file in `docs/`.
