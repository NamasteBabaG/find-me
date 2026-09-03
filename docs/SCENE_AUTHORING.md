# יצירת עולם חדש (Scene Authoring)

עולם = **ארט** (3 קבצים) + **קובץ הגדרה** אחד. הקוד לא משתנה.

## 1. הארט — מפרט לצ׳אט שמייצר את התמונות

| קובץ                                  | גודל       | תפקיד                                                                                        |
| ------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `public/scenes/<slug>/base.svg\|webp` | 1600×1000  | הסצנה המלאה, **בלי** הילד. 60–120 דמויות/חפצים, 6–10 סיטואציות קטנות, "דמויות מסיחות".        |
| `public/scenes/<slug>/foreground.*`   | 1600×1000  | שכבה שקופה שמצוירת **מעל** הילד: מסתירים (שיח, שמשייה, סלע) שמאחוריהם הילד מציץ. אופציונלי. |
| `public/scenes/<slug>/thumb.*`        | 320×200    | תמונת מפה/בחירה. חייבת להיות עצמאית (ללא הפניה לקובץ אחר).                                     |

כיוון אמנותי: **Storybook Collage** — גואש, קווי מתאר נקיים, מרקם נייר, דמויות כגזירי סטיקר. בלי טקסט בתמונה. בלי ילד "אמיתי" בסצנה (המערכת מוסיפה אותו). לא להציג סכנה ממשית.

עצה: לבקש מהצ׳אט לייצר את ה־base כך שיהיו בו **לפחות 6 "כיסים" ריקים** בגדלים של ~4%/3%/2.5% מגובה התמונה — שם יושבים הסלוטים.

## 2. קובץ ההגדרה — `content/scenes/<slug>/scene.json`

**כל שדה טקסט הוא דו־לשוני**: `{ "en": "Find {name} with the float ring", "he": "מצאו את {name} עם גלגל הים" }`. זה חל על `name`, `tagline`, `mission`, `item`, `success[]`, `hintText`, `label`, `reaction`, `bonus.name/prompt`, `celebration.completeText`, `collectible.name`. הולידציה דורשת `{name}` בשתי השפות.

הסכמה: `src/domain/scene/schema.ts` (zod). דוגמה מלאה: `content/scenes/beach/scene.json`.

```jsonc
{
  "id": "scene_beach", "slug": "beach", "name": "חוף הים", "tagline": "…",
  "version": 1, "active": true, "artStatus": "placeholder | draft | final",
  "art": { "width": 1600, "height": 1000, "base": "/scenes/beach/base.svg", "foreground": "...", "thumbnail": "...", "palette": { "sky": "#…", "ground": "#…", "accent": "#…" } },
  "intro": { "from": { "x": 0.3, "y": 0.6, "zoom": 1.6 }, "to": { "x": 0.5, "y": 0.5, "zoom": 1 }, "durationMs": 1600 },
  "targets": [ /* בדיוק 3 */ {
      "id": "float", "targetType": "beach_float", "bodyTemplate": "beach_float",
      "difficulty": 1,                       // 1 קל, 2 בינוני, 3 קשה — אחד מכל אחד
      "mission": "מצאו את {name} עם גלגל הים", "item": "גלגל ים",
      "success": ["ידעתי שתמצאו אותי!", "…"], // מתחלף בין משחקים
      "animation": "bounce",                  // bounce|wave|wiggle|spin|float|peek|salute|jump
      "slots": [ /* בדיוק 2: A (משחק ראשון), B (משחק חוזר) */ {
          "id": "beach_float_a", "x": 0.2, "y": 0.78, "scale": 0.075,
          "layer": "front | behindForeground", "flip": false, "rotation": 0, "zIndex": 10,
          "hintZone": { "x": 0.17, "y": 0.75, "r": 0.1 },   // חייב להכיל את (x,y)
          "hintText": "חפשו ליד משהו מתוק וקר."
      } ]
  } ],
  "ambient": [ { "id": "crab_bucket", "label": "סרטן בדלי", "x": 0.43, "y": 0.9, "w": 0.05, "h": 0.06, "animation": "hop", "sound": "boing", "reaction": "היי! זה הדלי שלי!", "glyph": "🦀" } ],
  "bonus": { "id": "zik", "name": "זיק", "sprite": "/scenes/shared/zik.svg", "scale": 0.035, "prompt": "רוצים למצוא גם את זיק?", "slots": [ … ] },
  "celebration": { "kind": "bubbles", "completeText": "מצאתם את {name} שלוש פעמים בחוף!" },
  "collectible": { "id": "shell", "name": "צדף מהחוף", "icon": "🐚" },
  "sounds": { "ambient": "waves" }
}
```

### כללי Level Design (נאכפים/מוזהרים ב־`validateSceneDefinition`)

- קואורדינטות 0..1 יחסית ל־1600×1000. `scale` = גובה הספרייט כחלק מגובה הסצנה: **~0.075 קל, ~0.06 בינוני, ~0.055 קשה** (בסצנה צפופה אמיתית: 0.04/0.03/0.025).
- A ו־B של אותה מטרה: מרחק ≥ 0.08 (אחרת אזהרה — ה־Replay ירגיש זהה).
- שלוש המטרות ב־A לא קרובות זו לזו (< 0.06 → אזהרה).
- `hintZone` מכיל את העוגן (שגיאה אם לא). רדיוס ~0.09–0.1.
- `behindForeground` רק אם יש ב־foreground מסתיר במקום — הפנים חייבות להישאר גלויות.
- `mission`/`completeText` כוללים `{name}`. הקופי ניטרלי מגדרית: ״מצאו את {name}…״, ״מציץ/ה״.
- `bodyTemplate` חייב להתקיים ב־`content/body-templates/index.ts` (הוסיפו שם גוף חדש עם אביזר).
- `active: true` רק כשהארט לפחות `draft` (אחרת אזהרה). חבילות 6/9 נפתחות אוטומטית כשיש מספיק עולמות פעילים.

## 3. חיבור וולידציה

1. `content/scenes/index.ts` — הוסיפו import ושורה במערך `RAW_SCENES` (הסדר = סדר המפה).
2. `npm run scenes:validate` — שגיאות עוצרות, אזהרות מודפסות.
3. `/admin/scenes/<slug>` — תצוגת A ו־B עם אזורי הרמז ודמות דמו. כאן מכיילים קואורדינטות.
4. `npm run check`.

## 4. תשעת העולמות

`beach` פעיל עם ארט אמיתי (`draft`, 1672×941, `assets/Beach.png` → `public/scenes/beach/base.webp`; ה־foreground הוא שני כיסויי שמשייה שנחתכו מאותה תמונה, כך שהדמות מציצה מאחוריהן). `jungle`, `space` פעילים עם placeholder. `city`, `ship`, `stadium`, `market`, `park`, `volcano` מוגדרים במלואם לפי האפיון (משימות, אינטראקציות, חגיגה, פריט) ומצביעים על `/scenes/_placeholder/` — כשמגיע ארט: מחליפים נתיבים, מכיילים סלוטים, `active: true`.

## Painting the child into a world

See `docs/SPRITE_PATCHES.md`: per-slot context crops, inpainting, and the `scripts/slot-patch.ts` export/import tool.
