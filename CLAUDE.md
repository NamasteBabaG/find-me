# CLAUDE.md — כללי עבודה בריפו "איפה אני?"

קרא לפני כל שינוי לא טריוויאלי. המסמכים המלאים: `docs/ARCHITECTURE.md`, `docs/SCENE_AUTHORING.md`, `docs/DESIGN_SYSTEM.md`.

## עקרונות שאסור לשבור

1. **Domain לפני UI.** `src/domain` הוא TypeScript טהור: בלי React, בלי Prisma, בלי Next. כל חוק משחק/מסחר חי שם ונבדק ב־vitest.
2. **מכונת המצבים מפורשת.** שינוי סטטוס של Game רק דרך `transitionGame()` (`src/services/game-status.ts`). אין `db.game.update({status})` ישיר.
3. **Webhook הוא האמת לתשלום.** אף redirect לא מסמן PAID. אין generation לפני PAID.
4. **Jobs אידמפוטנטיים.** `runGenerationPipeline` חייב להיות בטוח להרצה כפולה.
5. **כל ספק מאחורי interface** (`src/infra/*/types.ts`). ברירת המחדל היא mock. אין קריאות ישירות ל־API חיצוני מתוך services.
6. **סצנות הן data.** `content/scenes/<slug>/scene.json` + ארט ב־`public/scenes/<slug>/`. אין קואורדינטות/טקסטים של סצנה בתוך קומפוננטות.
7. **פרטיות:** תמונת המקור היא `PRIVATE` ולעולם לא נכנסת ל־GameConfig. `composeGameConfig` חותם רק נכסי `GAME`.
8. **Analytics ללא PII.** רק מפתחות מ־`ALLOWED_PROPS`. לא שם ילד, לא מייל.
9. **חוק ה־8 וטוקנים בלבד** ב־CSS. מינימום 48px למבוגר, 64px לילד. לילד אין X אדום, אין "נסו שוב", אין חנות.
10. **עברית ניטרלית מגדרית** בקופי (״מצאו את {name}״, הילד מדבר בגוף ראשון).
11. **אין טקסט קשיח לצרכן.** כל מחרוזת עוברת דרך `src/i18n` (en = מקור האמת, he מוקלד לפי `Dictionary`). שגיאות משירותים חוזרות כקודים (`FlowErrorCode`). ראה `docs/I18N.md`.

## לפני commit

```bash
git config core.hooksPath .githooks   # פעם אחת לכל clone — חוסם commit עם סוד
npm run check                          # tsc + vitest
npm run scenes:validate                # אם נגעת בסצנות
```

**לעולם לא `git add -A`.** פעמיים סיסמת דאטהבייס חיה נכנסה לריפו הציבורי בדיוק ככה — קובץ שאף אחד לא קרא נסחף פנימה. מוסיפים קבצים בשם, וקוראים את ה־diff לפני commit.

## מפת תיקיות

```
content/scenes/*       הגדרות עולמות (JSON דו־לשוני) + catalog loader
src/i18n               מילונים en/he, cookie שפה, מתג, קודי שגיאה
content/body-templates גופים לדמות המורכבת
public/scenes/*        ארט (base/foreground/thumb)
prisma/schema.prisma   DB (SQLite dev / Postgres prod; ללא enums/Json בכוונה)
src/domain             חוקים טהורים: package, order-state, scene/schema, game/*
src/infra              אדפטרים: db, storage, payment, generation (mock | openai), email, analytics, jobs
src/services           use-cases; container.ts הוא ה־composition root
src/services/generation patch.ts (חשבון ה־slot patch, משותף לסקריפט ולצינור), slot-patches, pipeline
src/game               renderer: engine (viewport, gestures), store, components, audio
src/ui + src/styles    מערכת העיצוב
src/app                routes (דקים — קוראים ל־services)
docs/                  תיעוד
```

## המחבואים (slot patches)

הרקעים מרונדרים פעם אחת. מה שמתרנדר לכל ילד זה רק **המחבוא**: חלון קטן מהעולם שהילד מצויר לתוכו.
החשבון היחיד נמצא ב־`src/services/generation/patch.ts` — הסקריפט והצינור חייבים לעבור דרכו.

- לכל פאץ' יש חוזה לחיצה: `rect` (איפה מציירים), `hitRect` (הגבולות האמיתיים של הילד), `anchor` (הראש).
  `src/game/engine/target-geometry.ts` הוא המקום היחיד שמחשב אותם — ציור, לחיצה ובועה חייבים לקרוא לו.
- `npx tsx scripts/prepare-boards.ts audit` בודק את כל 54 המחבואים בלי לשלם, ומצייר את החלון של כל אחד.
- הבדיקות הגיאומטריות בודקות **צורה**; `PatchJudge` בודק **זהות** (״זו היא, והפנים נראות?״). קטנוע וראש של סוס עוברים צורה.
- `npm run game:status -- <gameId>` מראה מה קרה לכל מחבוא, כמה עלה ולמה נדחה.
- ראה `docs/SPRITE_PATCHES.md`.

## איך מוסיפים עולם

ראה `docs/SCENE_AUTHORING.md`. בקצרה: תיקייה חדשה ב־`content/scenes/`, ארט ב־`public/scenes/`, שורת import ב־`content/scenes/index.ts`, `npm run scenes:validate`, תצוגה ב־`/admin/scenes/<slug>`.
