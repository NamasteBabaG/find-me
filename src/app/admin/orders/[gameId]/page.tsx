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
import { adjustTargetAction, adminDeleteAction, adminRotateLinkAction, approveAction, refundAction, regenTargetAction, requestPhotoAction, retryAction } from "../../actions";

export default async function AdminOrderPage({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ v?: string }> }) {
  const [{ gameId }, { v }] = await Promise.all([params, searchParams]);
  const variant: "A" | "B" = v === "B" ? "B" : "A";
  const c = getContainer();
  const detail = await orderDetailForAdmin(c, gameId);
  if (!detail) notFound();
  const { game, status, costCents, activity, awaitingQa, playable } = detail;
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
                {game.packageTier} · {game.scenes.length} עולמות
              </dd>
              <dt>תשלום</dt>
              <dd>
                {order ? `${formatPriceILS(order.amountAgorot, order.currency === "USD" ? "USD" : "ILS")} · ${order.paymentStatus} · ${order.provider}` : "—"}
              </dd>
              <dt>עלות יצירה</dt>
              <dd>{(costCents / 100).toFixed(2)} ₪</dd>
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
                <img src={`/api/assets/${avatarId}`} alt="אווטאר" className="photo-thumb" style={{ borderRadius: "999px" }} />
              ) : null}
            </div>
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
          </section>
        </aside>
      </div>
    </div>
  );
}
