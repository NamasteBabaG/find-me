# ארכיטקטורה — מפת הקוד, 6.10.2026

זהו תיאור של הקוד המנוהל ב־Git, לא הצהרה מה פרוס כרגע או אילו דגלים טעונים בשרת.
דוחות סבבים מתוארכים נשמרים כראיות היסטוריות; מסמך זה הוא נקודת הכניסה.

## שכבות ואחריות

```
Next.js routes / server actions
  → services: בעלות, תשלום, יצירה, פרסום, מחיקה
    → domain: חוזים וחוקים טהורים
    → infra: DB, אחסון, תשלום, תמונות, מייל ותורים

GameConfig השמור → GameShell → ScenePlayer → SceneViewport
```

- `src/domain`: TypeScript ללא React, Next, Prisma או services/infra.
- `src/services/container.ts`: בחירת ספקים. ברירת המחדל המקומית mock.
- `src/infra`: אדפטרים; קוד יישום לא מייבא scripts/ או work/.
- `content/scenes`: סצנות וגרסאות היסטוריות; `content/worlds`: מסעות בני תשעה בורדים.
- `Game.configJson`: החוזה שהשחקן מקבל, ללא תמונת המקור הפרטית.
- `scripts`: תחזוקה ועריכה ידנית, לא שכבת runtime.
- `work/`: ניסויים פרטיים שאינם חלק מבנייה נקייה.

`source-boundaries.test.ts` אוכף את גבולות הייבוא, קריאות שרת מחוץ ל־server actions
והפרדה מקוד לקוח. ארבעה ייבואי עזר היסטוריים של hash/pixels ושש בניות ספקים
בהקשר של פעולה בתשלום מוגבלים לקבצים ולסמלים נקובים; הם אינם היתר לתלות חדשה.
`tsconfig.json` הוא בדיקת הטיפוסים האחת גם לסקריפטים.

## מסלולי המנוע — לא גרסה אחת שמחליפה את כולן

| מסלול | תפקיד והמשך תמיכה |
| --- | --- |
| mock / slot-patches | פיתוח, דמו ומשחקים שנוצרו בחוזה הישן |
| fixed-world / board-conditioned | שחזור, אדמין, ביקורת ומחיקה של משחקים וראיות קיימים |
| local-patch-world-v1 | מנוע יצירה מחובר; בחירה מפורשת ב־QA, גרסת סצנה קובעת מדיניות |
| adventure / collection | תוכן האוסף והדרכון מחוברים לנגן, ל־API ולשמירה; בורדי פיילוט ללא ארט נשארים planned |

הנתיבים נבחרים ב־`create-flow.service.ts`, `generation/pipeline.ts` ו־`generation/queue.ts`.
`styleVersion` מזהה משפחת מנוע; `sceneVersion` מצמיד ארט, מיקומים וכללי איכות.
אין להחליף גרסה תחת משחק ששולם, להסיר גרסאות ישנות מהקטלוג או ליפול למנוע אחר כשספק חסר.

ב־local-patch:
1. בדיקה מוקדמת של הארט המצורף, הבעלות, הגיל וההרשאה להוצאה.
2. יצירת זהות מאוירת ורפרנס קנוני; האווטאר נגזר מהזהות, לא מפורטרט שני.
3. אישור זהות לפני הצגתה/המשך הוצאה; חוזי display/enrollment שונים בעוצמתם.
4. תור גרסאי של מחבואים → רינדור → שמירת התשובה והחשבון → הרכבה.
5. בגרסאות החדשות: ביקורת מרוכזת לבורד, עם קישורים לתמונות ולגאומטריה שנבדקו.
6. ניסיונות חוזרים לפי התור והתקציב המתועדים; לא מונה שמתחיל מחדש בכל tick.
   באוספים v10/v11, שני ניסיונות שנכשלו מעבירים לאבחון חזותי אוטומטי של המקור,
   התמונות ששולמו וההרכבה שנכשלה. האבחון בוחר הרכבה מתוקנת או מסכת ציור
   אחרת, וביקורת עצמאית בודקת את התוצאה. דחייה נוספת חוזרת לאבחון ולא
   לפסילת המשחק או לאישור הורה. התקציב והגנות החיוב נשמרים; ראו
   `QA_AUTONOMOUS_COLLECTION_RECOVERY_20260928.md`.
7. TargetInstance/TargetVariantAsset/Asset → קונפיג משחק עם כתובות נכסים חתומות → פרסום ומיילים.

הזהות נשמרת לפי הפנים והשיער ברפרנס הקנוני. לבוש, תאורה, תנוחה ורוויה מותאמים לבורד.
אין ללמוד מהשכנים זהות אחרת או להעתיק עיוותים של דמויות רחוקות.
כללי גיל, תפר חמור, דמיון וחריגי פנים־בלבד נקבעים ב־`local-patch-judge.ts` ובמדיניות הגרסה,
לא במתג גלובלי שמכשיר את כל התוצאות.

יצירה חדשה ב־QA בוחרת v12: עולם המסע או ממלכת הקסם, כל אחד עם תשעה
לוחות מאושרים ב־4K, ‏27 מחבואים ו־54 מציאות. רכישה יוצרת עולם אחד עם
תקרה מאושרת של $5 לעולם: בסיס $4 והרחבה אוטומטית בעקבות סירוב שמורה תקף,
גם בשלב הזהות וגם במחבואים. העולם השלישי אינו זמין במנוע הזה. אטלס הזהות v4 נבנה
מהלוחות של העולם שנבחר, והארט, המסכות והמציאות מוצמדים לאותם hashes.
הגיל שסופק קובע גובה ופרופורציות גוף בנפרד מפני הרפרנס;
גוף ישן או דמות הרקע אינם תבנית גיל. כישלון זהות/גיל אינו מוכשר בבחירת
הטוב משני ניסיונות: שני כישלונות נשמרים עם אבחון ומעבר אוטומטי לניסיון חדש.
הבדיקות והפרטים הבסיסיים ב־`QA_REFRESHED_PIPELINE_20260928.md`;
בדיקת החיבור הנוכחית היא `collection-world.test.ts`, עם ספק ותמונות סינתטיים.
משחקים ששולמו נשארים בגרסתם; חוזי המסע v12 ומקורות הזהות שלו נשמרו ללא שינוי.

שדרוג נושא (opt-in לעולם אחד, `local-patch-subject-upgrade/v1`): רישום אודיט בלתי־משתנה
שנכתב רק דרך `subject-upgrade.ts` (preflight קריא בלבד + apply מגודר ואידמפוטנטי).
בעולם רשום: תוכנית פעולה/מבט/הבעה וכובע חם באנטארקטיקה (`domain/generation/subject-policy.ts`),
בדיקת נראות מול תמונת המקור הפרטית והפורטרט הקנוני לכל 27 ההופעות לפני READY.
בציור חדש היא משולבת בשאלת האיכות של Opus Batch, עם שני פענוחים מחייבים וחשבון אחד;
Sol נשאר שופט עצמאי. הצייר מקבל גם תמונת מקור לזהות וגיל בלבד, ו־MEDIUM נבחר במפורש
בכשל גיל/דמיון או בניסיון האחרון; תיקון תנוחה בלבד יכול לשמור על LOW המוצמד.
שאלות Sol חדשות כ־background response עם polling לפי מזהה גם לפני בחירת המחבוא הבא,
ו־`world-automatic-review-recovery/v2` שומר את כל השמורות הלא ודאיות. מסלול מפעיל ב־QA
מאמת בעלות ו־preflight עדכני בלי להעניק הרשאת אדמין.
משחקים לא רשומים וחוזים היסטוריים לא משתנים. ראו `CLAUDE_SUBJECT_RECOVERY_20261018.md`.

## תשלום, תור והתאוששות

- תמחור העולם הראשון לאותו דרכון: 39 ₪; כל עולם נוסף: 30 ₪, ללא הגבלת זמן,
  גם ללקוחות קיימים. חבילות ראשונות: 39 / 69 / 99 ₪; לדרכון עם רכישה ששולמה:
  30 / 60 / 90 ₪. המחירים בדולרים נשמרו. מקור החוק הוא `domain/package.ts`.
- `child-pricing.service.ts` מאמת רכישה קודמת ששולמה ולא הוחזרה, באותו דרכון
  ובאותו חשבון. שם זהה או רכישת אח אינם מקנים זכאות. מסכי החבילה והקופה
  ושירות ההזמנה משתמשים באותה זכאות; רק השרת קובע את הסכום שנשלח לסליקה.
  הזמנות ששולמו נשארות במחירן ההיסטורי. המפתח הישן `ALL_WORLDS` קונה שלושה
  עולמות נבחרים בלבד; הוא אינו התחייבות לעולמות עתידיים. זמינות הקטלוג נשארת תנאי לרכישה.
- webhook מאומת הוא האמת לתשלום; redirect אינו מאשר PAID.
- `GenerationJob` מחזיק עבודה/ניסיון/lease; כתיבות משחק כפופות לבעלות על העבודה ולמחיקה.
- `purchaseOnce` ו־`WorldBudget` מנהלים מפתחות בקשה, fingerprint, שמירה לפני settlement והוצאה לא־ידועה.
- החוזים הטהורים שלהם נמצאים ב־`domain/generation`; הייבואים ההיסטוריים דרך services
  נשארו תואמים, כולל מחלקות השגיאה והגיבוב של קבלות.
- `PrismaRetainedPurchaseStore` + `FileBlob` שומרים תשובות וקבלות גם אם ניסיון נפסל.
- תוצאה שלילית מבחינה חזותית אינה חיוב לא־ידוע; חיוב לא־ידוע אינו אפס.
- replay דורש אותה בקשה, עולם, מדיניות וראיות. בקשה שנשלחה אך לא נשמרה אינה נרכשת שוב אוטומטית.
- `/api/jobs/tick` מניע פרוסות עבודה. `vercel.json` מגדיר GET של cron בכל דקה;
  עמוד creating יכול לתת דחיפה נוספת, אבל המחשב של ההורה אינו השרת.
- הפרוסות כפופות ל־deadline ול־lease. מצב parked/held מוצג בסטטוס/אדמין ומוחרג מהבחירה האוטומטית.
- אימות שה־cron אכן רץ שייך לבדיקת הפריסה, לא למעבר בדיקות יחידה.
- התראות תפעוליות אינן תזכורות מחזוריות: אותה התראה נשלחת פעם אחת לכל
  משחק, סוג ונמען. ניטור עיכוב מתייחס לתשלום מהיממה האחרונה ומכבד קבלות
  היסטוריות; משחק ישן אינו יוצר שוב מייל רק משום שעברו שש שעות.
  גוף המייל נשמר באופן פרטי, נשלח תחת מפתח קבוע ותפיסה אטומית, וניסיונות
  חוזרים מוגבלים לשלושה ול־23 שעות מהניסיון הראשון. לפני שליחה נבדק שהתקלה
  עדיין רלוונטית; התראה ישנה ללא מפתח שליחה אינה נשלחת מחדש אוטומטית.
  מחיקת משחק מוחקת גם גופי התראות ומבטלת שליחות ממתינות.
- `GENERATION_ENABLED=off` מונע התחלת עבודה במסלולים המוגנים שקראו אותו.
  אינו מבטל בקשות שכבר יצאו ואינו שולט בכל סקריפט ידני.

## ציור, לחיצה והתקדמות

`patch.ts` הוא מקור החשבון המשותף לספרייט־טלאי.
`target-geometry.ts` הוא מקור גאומטריית ציור/לחיצה/בועה.
`local-patch-seam.ts` מרכיב את גבולות ההחזרה; מחוץ לאזור אין להחליף פיקסלים.

`GameShell → ScenePlayer → SceneViewport` מציגים משחק עם viewport/מחוות, קול וחגיגה.
טעינת התצוגה שומרת על מחסום פענוח לרקע ולמחבוא הנוכחי בלבד; יעד עתידי איטי אינו חוסם משחק שכבר מוכן.
גם אחרי חימום מקדים, החלפת יעד נשארת מכוסה עד שפוענחו התמונות שמותקנות בפועל ב־DOM.
מעל העננים מוצגים כוכבי המשחק וטקסט טעינה נגיש; אין אחוז התקדמות מומצא או זמן המתנה מינימלי נוסף.
`board-display.ts` בוחר עותק תצוגה קטן רק בהתאמה מלאה לנתיב המקור, SHA השמור ומידות הלוח.
`content/board-display-art.json` קושר גם את בייטי עותק התצוגה; המקור, GameConfig, קלט הצייר וקבלות השיפוט אינם משתנים.

במסלול find-any הנוכחי המחבואים מוצגים **סדרתית**, לא חמש דמויות יחד.
שם השדה אינו הוראה לשנות זאת.

- גרסאות אוסף v10–v12: שלוש מטרות בכל בורד, 27 בעולם בן תשעה בורדים.
- גרסאות find-any ההיסטוריות v7–v9: חמש מטרות; פרסומים חלקיים היסטוריים נשמרים לפי החוזה שלהם.
- משחקים ישנים ללא find-any: שלוש מטרות לפי החוזה השמור.
- כוכב לכל מטרה ייחודית שנמצאה; שלוש מאפשרות מעבר; כל היעדים שנמסרו משלימים בורד.
- המכנה נגזר מהמשחק בפועל, לא 45 קשיח בכל מקום.
- `domain/game/progress.ts` ו־`mission.ts`: חוקים.
- `game/store/play-store.ts`: localStorage וחיבור UI.
- `/api/play/progress`: טלמטריה, לא שמירת אלבום או סנכרון בין דפדפנים.

## נכסים, פרטיות ופרסום

תמונת מקור ו־IDENTITY_SHEET הם PRIVATE. רק נכסי GAME מורשים נכנסים לקונפיג.
כתובת נכס חתומה אינה הופכת תמונת מקור לציבורית.
פרסום חייב לקשור הכרעה לבייטים ולגאומטריה שנמסרים; פענוח מחודש של שופט אינו קניית תשובה חדשה.
מדיניות האזהרות שונה בין גרסאות. `QA_AUTO_APPROVE` לבדו אינו היתר להכשיר כל פגם.

מחיקה מנותבת לפי המנוע: `game.service.ts` ו־`*-deletion.ts`.
יש לשמור יכולת מחיקה של זהות, טלאים שנפסלו, retained replies ונכסים יתומים;
ארט משותף ופנקס עלויות ללא תמונות אינם תמונות הילד.
מימושים טרנזקציוניים קיימים מעדכנים סטטוס/פנס/אודיט יחד; אין להעתיק מהם update בלתי־מוגן
או לעקוף את `transitionGame` במסלול רגיל.

## DB וספקים

`prisma/schema.prisma` הוא מקור סכימה (SQLite); ה־build מייצר עותק Postgres לפי יעדו.
`prisma/test-schema.sql` מכיל hash של המקור ונבדק כדי לא להריץ אינטגרציה על סכימה ישנה.
בדיקות SQLite אינן הוכחה למיגרציה או לתחרות ב־Postgres חי.

| ספק | מצב בקוד |
| --- | --- |
| תמונות | mock ו־OpenAI קיימים; לכל גרסה מדיניות מפורשת |
| אחסון | local ו־DB קיימים; supabase אינו אדפטר ממומש |
| תשלום | mock קיים; PayMe עדיין שלד |
| מייל | console ו־Resend קיימים; הצלחת שליחה חיה נבדקת בנפרד |
| jobs | inline/in-process להתחלה; תור DB + endpoint + cron להמשך |
| analytics | console/none; posthog אינו ממומש |

## האוסף והדרכון: תוכן פעיל לעומת בורדי פיילוט

`content/adventures` ו־`domain/adventure` מכילים גם אוספים פעילים וגרסאות שמורות.
`GameConfig.adventure` מחבר את המציאות, תמונות המזכרת והדרכון לנגן.
`/api/play/album` ושירות `adventure-album.service.ts` שומרים את התקדמות הבעלים
לאחר בדיקת בעלות; לאורחים ולמשתתפים משותפים מסלולי הרשאה והתקדמות נפרדים.
`GameShell` טוען את הקורא המתאים לפי חוזה הספר. מחיקה רכה קוראת ל־
`deleteAdventureAlbum` בתוך טרנזקציית המחיקה, כולל התקדמות אורחים וביטול שיתופים.
אין להסיר מודולים אלה כקוד מת. בדיקות SQLite מבודדות אינן אישור לפריסת DB חי.

בורדי פיילוט ללא ארט נשארים `planned`, ללא מיקומים או פריטי חיפוש מומצאים.
`ready` דורש קבצים, hash, מידות וגאומטריה לפני חיבור לגרסת יצירה.
`ADVENTURE_FOUNDATION_2026-09-14.md` מתעד את הבסיס ההיסטורי; הוא אינו תיאור
של גבולות החיבור הפעיל כיום.


## Explicit Detective single LOW experiment (23 October 2026)

The existing six-dollar owner receipt is immutable. A separate authenticated owner-admin
extension can bind the same unfinished Detective world, exact source/identity/age/payment,
failed hold and ledger revision to an eight-dollar cumulative cap and single-sol-low/v1.
It keeps every historical charge and unknown reservation, leaves the commercial four-dollar
default unchanged, and lets the normal queue consume the exact new hold once without resetting attempts.

Only that explicitly authorized world uses the experimental single LOW review for new
assessments. One gpt-6.1-sol Responses background request carries the complete quality,
source likeness/age/wardrobe, source-neighbor correspondence, and AFTER-only anatomy contracts.
The retained document exposes three mandatory logical readings sharing one billed request;
these are not claimed to be independent judges. Publication re-reads every strict contract,
the exact experimental authority and the one retained settled receipt. The cost record counts
that shared request once. Existing HIGH approvals and their original pins remain unchanged.
An unusable reply cannot authorize a routine second automatic review of the same pixels.
Explicit doubt remains non-acceptance; this experiment does not create a human art-approval flow.
Synthetic all-27 completion proves wiring and accounting, not live LOW quality, latency or unit economics.


## Detective LOW transport and guided-frame recovery (24 October 2026)

The explicitly authorized single LOW world reconstructs one immutable request from the same
quality, subject, source-neighbor and magnified anatomy evidence in dispatch and recovery.
A provider-ended recoverable failure with no text and no usage may continue once per image
and at most five times in that world under world-automatic-review-recovery/v5. The exact
request-specific reservation stays UNKNOWN and fully counted. A successful or malformed
answer, visible quality failure, account error or content refusal never uses this path.
The one continuation uses LOW at the default tier and a distinct fingerprint; polling and
replay of either request never submit it twice. Old v1-v4 receipts retain their original terms.

For a conclusive LOW boundary failure after two paintings, one still-unused
normal third painting may use single-low-guided-frame-recovery/v1. Its final reference is a
marked copy of the same public source crop. The API mask exposes the existing authored
return window, and the visual whole-child frame is a strict subset of the original child
envelope. The compositor, source-neighbor contract, hit geometry and all publication checks
keep their original permission. No source/window expansion or quality approval is granted.
The next image needs370000microUSD of available capacity before dispatch (120000image plus
the qualified250000 maximum LOW assessment bound); every actual reservation remains exact.
The third painting reuses the existing LOW diagnosis rather than buying another repair planner.
It preserves all previous repair counters (zero to three) and cannot open any further repair cycle.

A once-per-mode normal SYSTEM wake can revisit the exact earlier request-reconstruction
hold or a truly exhausted eligible frame failure after this software correction. It verifies
the same paid source, identity, avatar, age, all-nine family and eight-dollar grant, fences
the original job and ledger revision, preserves every request and attempt, and buys nothing.
The current world's ceiling and commercial defaults are unchanged. These checks prove wiring
and permissions; only real returned images and their strict reviews prove product quality.

Retained paid LOW replies are consumed before an unaffordable next repair. Board review
refreshes the first-answer state after each free result, so a settled continuation cannot
be stranded behind a stale first-pass snapshot. The retained-low-answer/v1 SYSTEM wake
is once per existing eight-dollar grant and requires the exact current image bytes,
geometry, authored return, original source/identity/age and trusted v5 continuation
authority, plus the same settled charge and immutable complete LOW reply. Its v2 audit
binds both request keys and the retained payload hash. It preserves the ledger snapshot,
UNKNOWN reservations and attempts; the normal reviewers still decide every mandatory
quality, identity, source-neighbor and anatomy check. This path buys no new opinion.
