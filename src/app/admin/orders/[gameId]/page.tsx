import { gameShape } from "@/services/world-catalog.service";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContainer } from "@/services/container";
import { orderDetailForAdmin } from "@/services/admin.service";
import { ensurePlayerLink } from "@/services/share-link.service";
import { parseGameConfig } from "@/domain/game/config";
import { withFreshAssetUrls } from "@/services/asset.service";
import { formatPriceILS } from "@/domain/package";
import { isPlayable } from "@/domain/order-state";
import { StaticScenePreview } from "@/game/components/StaticScenePreview";
import { ComposedSprite } from "@/game/components/ComposedSprite";
import { Notice } from "@/ui/Shell";
import { AttemptStrip } from "./AttemptStrip";
import { BoardWizardRecoveryForm } from "./BoardWizardRecoveryForm";
import { LocalPatchRepairResumeForm } from "./LocalPatchRepairResumeForm";
import { adjustTargetAction, adminDeleteAction, adminRotateLinkAction, approveAction, recutAvatarAction, refundAction, regenTargetAction, requestPhotoAction, retryAction } from "../../actions";
import { LOCAL_PATCH_NEEDS_RELEASE } from "@/services/generation/local-patch-world";
import { LOCAL_PATCH_HUMAN_CONFIRMATION } from "@/services/generation/local-patch-human-approval";

// The explicit as-is action hashes the 27 retained crops and publishes them
// transactionally; it makes no provider calls, but is not a short page action.
export const maxDuration = 300;

/** What the row's last review means to a person: reviewed and passed, reviewed and failed, could not decide, or never reviewed. */
function judgeLabel(judge: { verdict: string; reason: string; claimedVerdict?: string } | null): string {
  if (!judge) return "⚠ לא נבדק";
  if (judge.claimedVerdict && judge.claimedVerdict !== judge.verdict) return "? סתירה בין סיכום השופט לבדיקותיו";
  if (judge.verdict === "pass") return "✓ ללא הסתייגות מסכמת";
  if (judge.verdict === "fail") return "⚠ הסתייגויות השופט";
  if (judge.verdict === "ok") return "✓ נבדק";
  if (judge.verdict === "bad") return "✗ נדחה בבדיקה";
  return "? השופט לא הכריע";
}

export default async function AdminOrderPage({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ v?: string; repair?: string }> }) {
  const [{ gameId }, { v, repair }] = await Promise.all([params, searchParams]);
  const variant: "A" | "B" = v === "B" ? "B" : "A";
  const c = getContainer();
  const detail = await orderDetailForAdmin(c, gameId);
  if (!detail) notFound();
  const { game, status, costCents, localPatchCost, activity, failedSpots, paintedSpots, awaitingQa, playable } = detail;
  // Asset signatures expire; the stored config is re-signed on the way out.
  const config = game.configJson ? withFreshAssetUrls(getContainer(), parseGameConfig(game.configJson)) : null;
  const order = game.orders[0] ?? null;
  const playUrl = isPlayable(status) ? (await ensurePlayerLink(c, gameId)).url : null;
  const avatarId = game.childProfile?.avatarAssetId;
  const photoId = game.childProfile?.originalPhotoAssetId;

  return (
    <div className="fm-stack fm-stack--3">
      <Link href="/admin/orders" className="fm-small">
        ➜ כל ההזמנות
      </Link>
      <div className="fm-row fm-row--between">
        <h1>
          {game.title ?? "משחק"} <span className="fm-badge fm-badge--outline">{status}</span>
        </h1>
        <div className="fm-row">
          {awaitingQa ? (
            <form action={approveAction}>
              <input type="hidden" name="gameId" value={gameId} />
              {game.styleVersion === "local-patch-world-v1" ? <label className="fm-small">
                <input type="checkbox" name="confirmAsIs" value={LOCAL_PATCH_HUMAN_CONFIRMATION} required />
                קיבלתי אישור מהמשתמש לפרסם את כל 27 התמונות הנוכחיות כפי שהן, כולל האחרונות שנפסלו. ללא רינדור נוסף; פסיקת השופט נשמרת.
              </label> : null}
              <button className="fm-btn" type="submit">
                ✓ אישור ופרסום
              </button>
            </form>
          ) : null}
          {status === "GENERATION_FAILED" || status === "NEEDS_REGENERATION" || status === "NEEDS_NEW_PHOTO" ? (
            <form action={retryAction}>
              <input type="hidden" name="gameId" value={gameId} />
              <button className="fm-btn fm-btn--sea" type="submit">
                ↻ הרצה מחדש
              </button>
            </form>
          ) : null}
        </div>
      </div>
      {game.lastError ? <Notice kind="danger">{game.lastError}</Notice> : null}
      {repair === "queued" ? <Notice>ניסיונות התיקון אושרו ונוספו לתור היצירה בשרת.</Notice> : null}
      {repair === "blocked" ? <Notice kind="danger">התיקון לא אושר. רעננו ובדקו את מצב המשחק, ההרשאה והחיובים לפני ניסיון נוסף.</Notice> : null}
      <BoardWizardRecoveryForm gameId={gameId} />
      <LocalPatchRepairResumeForm gameId={gameId} />

      <div className="admin__grid">
        <div className="fm-stack fm-stack--3">
          {config ? (
            config.scenes.map((scene) => {
              const gs = game.scenes.find((s) => s.sceneSlug === scene.slug);
              return (
                <section key={scene.slug} className="fm-card review-scene">
                  <div className="fm-row fm-row--between">
                    <h2>{scene.name}</h2>
                    <div className="fm-row">
                      <Link href={`?v=A`} className={`fm-badge ${variant === "A" ? "fm-badge--ink" : "fm-badge--outline"}`}>
                        מיקום A
                      </Link>
                      <Link href={`?v=B`} className={`fm-badge ${variant === "B" ? "fm-badge--ink" : "fm-badge--outline"}`}>
                        מיקום B
                      </Link>
                      <span className="fm-badge fm-badge--outline">{gs?.generationStatus}</span>
                    </div>
                  </div>
                  <StaticScenePreview scene={scene} variant={variant} showZones />
                  <div className="fm-stack fm-stack--1">
                    {scene.targets.map((t) => {
                      const row = gs?.targets.find((x) => x.targetId === t.id);
                      const adj = t.adjust ?? { dx: 0, dy: 0, scale: 1 };
                      return (
                        <div key={t.id} className="target-row">
                          <div className="target-row__thumb">
                            {t.sprite.kind === "composed" ? (
                              <ComposedSprite faceUrl={t.sprite.faceUrl} bodyTemplate={t.sprite.bodyTemplate} />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.sprite.url} alt={t.item} />
                            )}
                          </div>
                          <div className="fm-stack fm-stack--1">
                            <strong>{t.mission}</strong>
                            <span className="fm-small">
                              {t.targetType} · {row?.status} · ניסיונות {row?.attempts ?? 0} · {t.sprite.kind}
                            </span>
                            {t.sprite.kind === "image" && t.sprite.rect ? (
                              // A painted patch is a piece of the world: it is drawn, tapped and
                              // pointed at from its own alpha (target-geometry), and dx/dy/scale
                              // do not apply to it. The form used to accept them and change nothing.
                              <span className="fm-small">מחבוא מצויר: המיקום, אזור הלחיצה והראש באים מהפאץ׳ עצמו; אין כאן dx/dy/scale. לתיקון — ↻ Regenerate.</span>
                            ) : (
                              <form action={adjustTargetAction} className="adjust">
                                <input type="hidden" name="gameId" value={gameId} />
                                <input type="hidden" name="targetInstanceId" value={row?.id ?? ""} />
                                <label className="fm-small">
                                  dx <input className="fm-input" name="dx" type="number" step="0.005" min="-0.2" max="0.2" defaultValue={adj.dx} />
                                </label>
                                <label className="fm-small">
                                  dy <input className="fm-input" name="dy" type="number" step="0.005" min="-0.2" max="0.2" defaultValue={adj.dy} />
                                </label>
                                <label className="fm-small">
                                  scale <input className="fm-input" name="scale" type="number" step="0.05" min="0.5" max="2" defaultValue={adj.scale} />
                                </label>
                                <button className="fm-btn fm-btn--secondary fm-btn--sm" type="submit" disabled={!row}>
                                  עדכון
                                </button>
                              </form>
                            )}
                          </div>
                          <form action={regenTargetAction}>
                            <input type="hidden" name="gameId" value={gameId} />
                            <input type="hidden" name="targetInstanceId" value={row?.id ?? ""} />
                            <button className="fm-btn fm-btn--ghost fm-btn--sm" type="submit" disabled={!row}>
                              ↻ Regenerate
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          ) : (
            <Notice kind="info">עדיין אין קונפיגורציה — המשחק לא הורכב.</Notice>
          )}

          {paintedSpots.length > 0 ? (
            <section className="fm-card fm-stack fm-stack--2">
              <h3>המחבואים שיצאו ({paintedSpots.length})</h3>
              <p className="fm-small">
                הבדיקות מאשרות צורה, לא זהות — ילד בגודל ובמקום הנכונים עובר גם אם הוא בכלל לא הילד/ה. בתוך הסצנה קשה לראות את זה; בשורה כזאת ראש
                של סוס קופץ לעין תוך שנייה. מתחת לכל מחבוא: כל ניסיון, שלב אחרי שלב, עם ההרכבה שהשופט ראה ופסק הדין שלו.
              </p>
              <div className="fm-stack fm-stack--2">
                {paintedSpots.map((spot) => (
                  <details key={spot.id} id={`hide-${spot.sceneSlug}-${spot.targetId}`} className="fm-stack fm-stack--1">
                    <summary className="fm-row" style={{ gap: "var(--space-2)", cursor: "pointer" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/assets/${spot.assetId}`}
                        alt={`${spot.sceneSlug}/${spot.targetId}`}
                        style={{ width: 72, height: 100, objectFit: "contain", background: "var(--surface-2)", borderRadius: "var(--radius-2)" }}
                      />
                      <span className="fm-small" dir="ltr">
                        {spot.sceneSlug}/{spot.targetId}
                        {spot.attempts > 1 ? ` · ${spot.attempts} attempts` : ""}
                        <div title={spot.judge?.reason ?? ""}>{judgeLabel(spot.judge)}{spot.judge?.model ? ` · ${spot.judge.model}` : ""}</div>
                      </span>
                      <form action={regenTargetAction}>
                        <input type="hidden" name="gameId" value={gameId} />
                        <input type="hidden" name="targetInstanceId" value={spot.targetInstanceId} />
                        <button className="fm-btn fm-btn--ghost fm-btn--sm" type="submit">
                          ↻
                        </button>
                      </form>
                    </summary>
                    {spot.judge ? <div className="fm-stack fm-stack--1">
                      <p className="fm-small" dir="auto">{spot.judge.reason}</p>
                      {spot.judge.faults?.length ? <ul className="fm-small" dir="auto">{spot.judge.faults.map((fault, index) => <li key={index}>{fault.check}: {fault.where}</li>)}</ul> : null}
                      <a href={`/api/assets/${spot.assetId}`} className="fm-small" target="_blank" rel="noreferrer">לפתוח את תמונת המחבוא בגודל מלא</a>
                    </div> : null}
                    <AttemptStrip attempts={spot.history} />
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {failedSpots.length > 0 ? (
            <section className="fm-card fm-stack fm-stack--2">
              <h3>מחבואים שלא יצאו ({failedSpots.length})</h3>
              <p className="fm-small">לכל ניסיון: מה הצייר צייר, מה המעבר השני ענה, מה נחתך, ומה השופט ראה — עם השלב שדחה אותו. ״לא נשמר״ הוא ניסיון שנרשם לפני שהראיה הזאת נשמרה, לא ראיה שנמחקה.</p>
              {failedSpots.map((spot) => (
                <div key={spot.id} className="fm-stack fm-stack--1">
                  <div className="fm-row fm-row--between">
                    <strong dir="ltr">
                      {spot.sceneSlug}/{spot.targetId}/{spot.variant}
                    </strong>
                    <span className="fm-small">
                      {spot.status} · ניסיונות {spot.attempts} · {(spot.costCents / 100).toFixed(2)} USD
                    </span>
                  </div>
                  {spot.lastError ? (
                    <span className="fm-small" dir="ltr">
                      {spot.lastError}
                    </span>
                  ) : null}
                  {spot.history.length > 0 ? (
                    <AttemptStrip attempts={spot.history} />
                  ) : spot.rejectedAssetIds.length > 0 ? (
                    <div className="fm-row">
                      {spot.rejectedAssetIds.map((assetId) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={assetId} src={`/api/assets/${assetId}`} alt="ציור שנדחה" className="photo-thumb" />
                      ))}
                    </div>
                  ) : (
                    <span className="fm-small">אין תמונות שמורות מהניסיונות האלה.</span>
                  )}
                  <form action={regenTargetAction}>
                    <input type="hidden" name="gameId" value={gameId} />
                    <input type="hidden" name="targetInstanceId" value={spot.targetInstanceId} />
                    <button className="fm-btn fm-btn--ghost fm-btn--sm" type="submit">
                      ↻ נסו שוב את המחבוא הזה
                    </button>
                  </form>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="fm-stack fm-stack--3">
          <section className="fm-card fm-stack fm-stack--2">
            <h3>פרטים</h3>
            <dl className="kv">
              <dt>ילד/ה</dt>
              <dd>{game.childProfile?.displayName}</dd>
              <dt>מייל</dt>
              <dd dir="ltr">{game.owner?.email}</dd>
              <dt>חבילה</dt>
              <dd>
                {game.packageTier} · {(() => { const s = gameShape(game.scenes); return `${s.worlds} עולמות · ${s.places} מקומות · ${s.spots} מחבואים`; })()}
              </dd>
              <dt>תשלום</dt>
              <dd>
                {order ? `${formatPriceILS(order.amountAgorot, order.currency === "USD" ? "USD" : "ILS")} · ${order.paymentStatus} · ${order.provider}` : "—"}
              </dd>
              <dt>עלות יצירה</dt>
              <dd>{costCents === null ? "עלות לא זמינה — נדרש בירור" : `${(costCents / 100).toFixed(2)} USD`}</dd>
              {localPatchCost && <dd className="mt-1 text-xs text-muted-foreground">
                בפנקס: {(localPatchCost.settledMicroUsd / 1_000_000).toFixed(6)} USD
                {localPatchCost.estimated ? " — כולל אומדני תעריף, לא חשבונית ספק" : ""}.
                {" "}זהות {(localPatchCost.byScope.identity.settledMicroUsd / 1_000_000).toFixed(4)},
                {" "}תמונות {((localPatchCost.byScope.image.settledMicroUsd + localPatchCost.byScope.sheet.settledMicroUsd + localPatchCost.byScope.repair.settledMicroUsd) / 1_000_000).toFixed(4)},
                {" "}שיפוט {(localPatchCost.byScope.judge.settledMicroUsd / 1_000_000).toFixed(4)} USD.
                {localPatchCost.unresolved && <> הסכום אינו סופי: {localPatchCost.unknownCharges} חיובים לא ידועים; {(localPatchCost.reservedMicroUsd / 1_000_000).toFixed(4)} USD שמורים ואינם חיוב נוסף.</>}
              </dd>}
              <dt>Game id</dt>
              <dd>{game.id}</dd>
              <dt>קישור</dt>
              <dd>{playUrl ? <a href={playUrl} target="_blank" rel="noreferrer">לפתיחת המשחק</a> : "—"}</dd>
            </dl>
            <div className="fm-row">
              {photoId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${photoId}`} alt="תמונת מקור" className="photo-thumb" />
              ) : (
                <span className="fm-badge fm-badge--outline">תמונת המקור נמחקה</span>
              )}
              {avatarId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${avatarId}`} alt="אווטאר" className="photo-thumb" style={{ borderRadius: game.styleVersion === "local-patch-world-v1" ? "12px" : "999px", objectFit: "contain" }} />
              ) : null}
            </div>
            {game.childProfile?.identityAssetId ? (
              // A display-only derivative of the retained sheet, never a new render.
              <form action={recutAvatarAction}>
                <input type="hidden" name="gameId" value={gameId} />
                <button className="fm-btn fm-btn--secondary fm-btn--sm" type="submit">
                  {game.styleVersion === "local-patch-world-v1"
                    ? "◎ להציג את כל הפנים — תיקון תצוגה ללא עלות"
                    : "◎ לחתוך את האווטאר מחדש סביב הפנים"}
                </button>
              </form>
            ) : null}
          </section>

          <section className="fm-card fm-stack fm-stack--2">
            <h3>פעולות</h3>
            <form action={requestPhotoAction} className="fm-stack fm-stack--1">
              <input type="hidden" name="gameId" value={gameId} />
              <input className="fm-input" name="note" placeholder="הערה להורה (תמונה חדשה)" />
              <button className="fm-btn fm-btn--secondary fm-btn--sm" type="submit">
                בקשת תמונה חדשה
              </button>
            </form>
            {playable ? (
              <form action={adminRotateLinkAction}>
                <input type="hidden" name="gameId" value={gameId} />
                <button className="fm-btn fm-btn--secondary fm-btn--sm" type="submit">
                  ביטול והחלפת קישור
                </button>
              </form>
            ) : null}
            {order?.paymentStatus === "PAID" ? (
              <form action={refundAction}>
                <input type="hidden" name="gameId" value={gameId} />
                <input type="hidden" name="orderId" value={order.id} />
                <button className="fm-btn fm-btn--danger fm-btn--sm" type="submit">
                  החזר כספי
                </button>
              </form>
            ) : null}
            <form action={adminDeleteAction}>
              <input type="hidden" name="gameId" value={gameId} />
              <button className="fm-btn fm-btn--danger fm-btn--sm" type="submit">
                מחיקת המשחק
              </button>
            </form>
          </section>

          <section className="fm-card fm-stack fm-stack--2">
            <h3>יומן</h3>
            <ul className="log">
              {activity.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.action} <span className="fm-muted">({a.actorType})</span>
                  </span>
                  <time>{a.createdAt.toLocaleTimeString("he-IL")}</time>
                </li>
              ))}
            </ul>
            {game.jobs[0] ? (
              <p className="fm-small">
                job: {game.jobs[0].status} · {game.jobs[0].currentStep ?? "—"} · attempts {game.jobs[0].attempts}
              </p>
            ) : null}
            {/* A world parked for a person says WHY here, because the only other
                place it exists is a job column nobody opens a database to read. */}
            {game.jobs[0]?.currentStep === LOCAL_PATCH_NEEDS_RELEASE ? (
              <p className="fm-small" style={{ color: "var(--fm-danger, #b00)" }}>
                ממתין לשחרור ידני: {game.jobs[0].lastError ?? LOCAL_PATCH_NEEDS_RELEASE}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
