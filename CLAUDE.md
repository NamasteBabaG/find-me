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
npm run check           # tsc + vitest
npm run scenes:validate # אם נגעת בסצנות
```

## מפת תיקיות

```
content/scenes/*       הגדרות עולמות (JSON דו־לשוני) + catalog loader
src/i18n               מילונים en/he, cookie שפה, מתג, קודי שגיאה
content/body-templates גופים לדמות המורכבת
public/scenes/*        ארט (base/foreground/thumb)
prisma/schema.prisma   DB (SQLite dev / Postgres prod; ללא enums/Json בכוונה)
src/domain             חוקים טהורים: package, order-state, scene/schema, game/*
src/infra              אדפטרים: db, storage, payment, generation, email, analytics, jobs
src/services           use-cases; container.ts הוא ה־composition root
src/game               renderer: engine (viewport, gestures), store, components, audio
src/ui + src/styles    מערכת העיצוב
src/app                routes (דקים — קוראים ל־services)
docs/                  תיעוד
```

## איך מוסיפים עולם

ראה `docs/SCENE_AUTHORING.md`. בקצרה: תיקייה חדשה ב־`content/scenes/`, ארט ב־`public/scenes/`, שורת import ב־`content/scenes/index.ts`, `npm run scenes:validate`, תצוגה ב־`/admin/scenes/<slug>`.
