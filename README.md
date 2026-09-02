# איפה אני? — משחק חפש־ומצא אישי לילדים

תמונה אחת → משחק חיפוש פרטי שבו הילד מתחבא בעולמות מאוירים. Next.js 15, TypeScript, Prisma.

## הרצה מקומית

```bash
npm install
npm run setup      # prisma generate + SQLite dev.db
npm run dev        # http://localhost:3000
```

אין צורך בשום חשבון חיצוני: תשלום, יצירת תמונות, מיילים ואחסון רצים על ספקי mock (ראו `.env.example`).

## הזרימה המלאה בדקה

1. `/` — הדגמה חיה (מאיה בחוף). לוחצים עליה, רואים אנימציה.
2. `/create` — שם → תמונה (חיתוך בעיגול) → חבילה → עולמות → סיכום ומייל.
3. `/checkout/mock` — דף תשלום מדומה ששולח webhook חתום. **רק ה־webhook מסמן PAID.**
4. `/creating/<gameId>` — מסך התקדמות; ברקע רץ ה־pipeline (avatar → targets → compose → QA).
5. עם `QA_AUTO_APPROVE="true"` (ברירת המחדל ב־dev) המשחק מתפרסם לבד ונשלח מייל. אחרת: `/admin/orders` → אישור.
6. המייל מופיע ב־`/dev/outbox` (ובקונסול). הקישור `/play/<token>` פותח את המשחק ללא login.
7. `/library` — Magic Link למייל, ניהול, שיתוף, עטיפת מתנה, מחיקה.

כניסה לאדמין: המייל ב־`ADMIN_EMAILS` נכנס דרך `/library` (Magic Link) ורואה "אדמין" בתפריט.

## פקודות

| פקודה                     | מה                                        |
| ------------------------- | ----------------------------------------- |
| `npm run dev`             | שרת פיתוח                                 |
| `npm run check`           | typecheck + בדיקות (החוזה לפני commit)   |
| `npm run scenes:validate` | ולידציה של כל קובצי הסצנות + אזהרות       |
| `npm run smoke`           | בדיקת קצה־לקצה בלי דפדפן: רכישה → יצירה → לינק |
| `npm run db:studio`       | Prisma Studio                             |
| `npm run db:reset`        | איפוס ה־DB המקומי                         |

## מסמכים

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — שכבות, זרימת נתונים, מכונת מצבים, ספקים, פרטיות.
- [docs/SCENE_AUTHORING.md](docs/SCENE_AUTHORING.md) — איך יוצרים עולם חדש (הארט, הקובץ, הכללים).
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — טוקנים, חוק ה־8, רכיבים, כללי ילד/הורה. חי גם ב־`/design-system`.
- [docs/I18N.md](docs/I18N.md) — אנגלית כברירת מחדל, עברית במתג, סצנות דו־לשוניות, שפת המשחק קפואה ברכישה.
- [CLAUDE.md](CLAUDE.md) — כללי עבודה לסוכנים.

## מצב הפרויקט

- ✅ ארכיטקטורה מלאה, דומיין נבדק, זרימת רכישה→יצירה→משחק עובדת מקצה לקצה עם mocks.
- ✅ 3 עולמות פעילים: חוף (ארט אמיתי, draft), ג׳ונגל וחלל (placeholder) — 6 עולמות נוספים מוגדרים אך כבויים.
- ✅ האתר באנגלית (LTR) כברירת מחדל עם מתג לעברית (RTL); מחירים 19.90 / 39.90 / 59.90 ₪.
- ⏳ ארט אמיתי לעולמות (נוצר בנפרד), ספק תמונות אמיתי, PayMe, Resend, Supabase Storage — כולם מאחורי interfaces קיימים.
