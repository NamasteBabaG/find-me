# ארכיטקטורה — "איפה אני?"

## 1. תמונה גדולה

```
Parent Web App (Next.js App Router)
  /            landing + live demo (real renderer, demo config)
  /create/*    stepper: name → photo → package → scenes → checkout
  /creating    progress (polls status API)
  /play/<tok>  the game (no login)
  /library     magic-link account, manage/share/delete
  /admin/*     QA, scenes, costs
        │  thin routes / server actions
        ▼
Services (src/services) ── use-cases, receive the Container explicitly
  create-flow · order · publish · game · share-link · auth · asset
  scene-catalog · progress · admin · generation/pipeline · generation/scene-composer
  generation/patch (slot-patch maths) · generation/slot-patches · generation/scene-art
        │
        ├── Domain (src/domain) — pure TS, tested
        │     package · order-state (state machine) · scene/schema (zod)
        │     game/config (GameConfig) · game/compose · game/replay · game/mission · game/hints · game/progress
        │
        └── Infra (src/infra) — one interface per provider, mock by default
              db (Prisma) · storage (local | supabase*) · payment (mock | payme*)
              generation (mock sticker | openai identity sheet + inpaint | replicate*) · email (console | resend)
              analytics (console | posthog*) · jobs (in-process | trigger*/inngest*)
                                                  * = adapter stub / to be written
```

`src/services/container.ts` בונה את כל הספקים לפי env פעם אחת. Services מקבלים `Container` כפרמטר — קל להחליף ב־fakes בבדיקות.

## 2. הנכס הקבוע לעומת הנכס האישי

| קבוע (משותף לכל הילדים)                         | אישי (למשחק)                                                 |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `content/scenes/<slug>/scene.json` — level design | `Game` + `GameScene` + `TargetInstance` בטבלאות              |
| `public/scenes/<slug>/{base,foreground,thumb}`    | `Asset` (AVATAR / TARGET_SPRITE) ב־storage                   |
| `content/body-templates`                          | `Game.configJson` — ה־`GameConfig` שהשחקן מקבל               |

`GameConfig` (`src/domain/game/config.ts`) הוא החוזה בין השרת ל־renderer. הוא נבנה פעם אחת ב־`composeGameConfig` ונשמר. **אינו מכיל את תמונת המקור** — הפונקציה חותמת רק נכסים עם `visibility = GAME`.

### הדמות המורכבת (אסטרטגיית ה־MVP)
`MockAvatarProvider` הופך את התמונה שההורה חתך לסטיקר עגול (sharp). ה־renderer (`ComposedSprite`) מצייר גוף פרוצדורלי לפי `bodyTemplate` ושם את הסטיקר בראש. אפס קרדיטים, אפס בעיות עקביות. ספק אמיתי בעתיד מחזיר `{kind:"image"}` — ה־renderer כבר תומך בשני הסוגים (`SpriteRef`).

## 3. מכונת המצבים (src/domain/order-state.ts)

```
DRAFT → PHOTO_UPLOADED → PHOTO_VALIDATING → PHOTO_APPROVED | PHOTO_REJECTED
      → PACKAGE_SELECTED → CHECKOUT_PENDING → PAID | PAYMENT_FAILED
PAID → AVATAR_GENERATING → TARGETS_GENERATING → SCENES_COMPOSING → QA_PENDING
QA_PENDING → APPROVED → READY → DELIVERED
QA_PENDING → NEEDS_REGENERATION | NEEDS_NEW_PHOTO | MANUAL_REVIEW
edge: GENERATION_FAILED · CANCELLED · REFUNDED · DELETED
```

`transitionGame()` הוא הדרך היחידה לשנות סטטוס: בודק מול טבלת המעברים, כותב `AuditLog`, מחתים `paidAt/readyAt/deliveredAt`.

## 4. זרימת רכישה → משחק

1. **Draft** — `Game` עם `draftToken` ב־cookie (`findme_draft`). אין חשבון עדיין.
2. **Photo** — `POST /api/drafts/photo` (multipart + crop). `checkPhoto` (sharp): סוג, גודל, מינימום 400px. נכס `ORIGINAL_PHOTO/PRIVATE`.
3. **Package/Scenes** — `purchasableTiers(activeScenes)` מסתיר חבילות ללא מספיק עולמות. בחירה מומלצת מראש.
4. **Checkout** — המייל יוצר `User` רך, `Order(PENDING)`, `PaymentProvider.createCheckout()` → redirect.
5. **Webhook** — `POST /api/webhooks/payment` → `handlePaymentWebhook`: אימות חתימה, `PaymentEvent` ייחודי (idempotency), אימות סכום, `PAID`, `jobs.enqueue("generate-game")`.
6. **Pipeline** (`services/generation/pipeline.ts`) — צעדים אידמפוטנטיים עם `GenerationJob.stepsJson`:
   `avatar` → `targets` → `compose` → `qa`.
   עם ספק אמיתי (`GENERATION_PROVIDER=openai`) הצעד הראשון מייצר **גיליון זהות** אחד לילד
   (`IDENTITY_SHEET`, PRIVATE) והאווטאר נחתך ממנו; הצעד השני מצייר את הילד **לתוך** העולם, מחבוא
   אחד בכל פעם, ושומר שורת `TargetVariantAsset` לכל (מטרה, וריאנט) עם גאומטריה, מודל, usage, נסיונות
   ועלות. כך אפשר לאשר, לדחות ולייצר מחדש מחבוא בודד. ראה `docs/SPRITE_PATCHES.md`.
7. **Publish** (`publish.service.ts`) — `APPROVED → READY`, יצירת `ShareLink`, **מחיקת תמונת המקור** (אלא אם `retainOriginalPhoto`), מייל, `DELIVERED`.
8. **Play** — `/play/<token>` → `resolvePlayToken` → `GameShell(config)`.

`QA_AUTO_APPROVE=true` (dev) מדלג על האדם. בפרודקשן: `/admin/orders` → "אישור ופרסום".

## 5. קישורי משחק

טוקן = `<shareLinkId>.<HMAC(id, createdAt, SESSION_SECRET)>`. ה־DB שומר רק SHA-256 של הטוקן. הטוקן ניתן לשחזור לתצוגה בספרייה ללא שמירה בגלוי; החלפה = ביטול השורה ויצירת חדשה. אורח שומר התקדמות ב־localStorage שלו בלבד.

## 6. ה־Renderer (src/game)

```
GameShell (screens: gift → map → scene → passport)
  └─ ScenePlayer (top bar, choreography, MissionCard, SceneCompleteCard)
       └─ SceneViewport
            ├─ stage (CSS transform): base → sprites(behind) → foreground → sprites(front) → bonus → ambient → glow
            └─ overlay (screen space): ripples, magnifier, speech bubbles
```

- **Gestures** — `useViewport`: Pointer Events בלבד; pan, pinch, wheel, double-tap, clamp, אנימציית מיקוד. מתמטיקה טהורה ב־`viewport-math.ts` (נבדקת).
- **Hit-testing** — מתמטי, לא DOM: מלבן הספרייט + padding ≥ 48px מסך. עדיפות: מטרות > בונוס > אמביינט.
- **Mission reducer** (`domain/game/mission.ts`) — כל החוקים: פאזות, טעויות ידידותיות, רמזים 1–3, בונוס. ה־UI רק מגיב ל־`lastFeedback`.
- **Replay** (`domain/game/replay.ts`) — סיד דטרמיניסטי (gameId+slug+playIndex): החלפת A/B לכל מטרה, ערבוב סדר, רוטציית משפטי הצלחה.
- **Sound** — WebAudio מסונתז (`audio/sounds.ts`), נפתח בלחיצת "פתיחת ההרפתקה". אין קובצי אודיו.
- **Progress** — localStorage (`findme:progress:v1:<gameId>`) + אירועים אגרגטיביים ל־`/api/play/progress` (sendBeacon).

## 7. נתונים (prisma/schema.prisma)

User · MagicLinkToken · Session · ChildProfile · Game · GameScene · TargetInstance · **TargetVariantAsset** · Asset · Order · PaymentEvent · ShareLink · GenerationJob · PlaySession · ProgressEvent · SceneOverride · AuditLog.

בכוונה **ללא enums ו־Json**: מחרוזות המאומתות בדומיין/zod, כדי ש־SQLite (dev) ו־Postgres (prod) יהיו זהים. מעבר ל־Postgres: `provider = "postgresql"` + `prisma migrate`.

## 7b. שפות

ראה `docs/I18N.md`. בקצרה: `Game.locale` נקבע ביצירת הטיוטה משפת האתר, `composeGameConfig` בוחר את השפה מהסצנה הדו־לשונית, וה־renderer קורא `config.locale`.

## 8. פרטיות ובטיחות

- אין חשבון/פרופיל לילד, אין גלריה, אין פרסומות, אין CTA בתוך המשחק.
- `ORIGINAL_PHOTO` = PRIVATE (בעלים/אדמין בלבד, `no-store`), נמחקת אחרי אישור.
- `AVATAR`/`TARGET_SPRITE` = GAME, נגישים רק דרך URL חתום.
- מחיקת משחק מוחקת נכסים אישיים ומבטלת קישורים; ארט הסצנות משותף ולא נוגעים בו.
- Analytics: whitelist של מאפיינים (`ALLOWED_PROPS`).

## 9. Jobs בפרודקשן

`InProcessJobRunner` רץ באותו תהליך (setTimeout). ב־Vercel הפונקציה עלולה להיקטע → להחליף ל־Trigger.dev/Inngest: לממש `JobRunner` (register/enqueue) ולקרוא ל־`runGenerationPipeline(container, gameId)` מה־worker. הצעדים כבר resumable, כך ש־retry של הספק בטוח.

## 10. מה מחליפים כשעוברים לפרודקשן

| רכיב     | dev                 | prod                                     |
| -------- | ------------------- | ---------------------------------------- |
| DB       | SQLite              | Postgres (Supabase)                      |
| Storage  | `storage/` בדיסק     | Supabase Storage — `StorageProvider`     |
| Payment  | MockPaymentProvider | `PayMeProvider` (skeleton קיים)          |
| Avatar   | sticker (sharp)     | ספק תמונות אמיתי — `AvatarProvider`      |
| Email    | console + outbox    | `ResendEmailProvider` (קיים)             |
| Jobs     | in-process          | Trigger.dev / Inngest                    |
| QA       | auto-approve        | אדם ב־/admin                             |
| Faces    | NoopFaceDetector    | זיהוי פנים אמיתי — `FaceDetector`        |
