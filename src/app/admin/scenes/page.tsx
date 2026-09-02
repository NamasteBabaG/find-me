import Link from "next/link";
import { getContainer } from "@/services/container";
import { catalogForAdmin } from "@/services/scene-catalog.service";
import { setSceneActiveAction } from "../actions";

export default async function AdminScenesPage() {
  const entries = await catalogForAdmin(getContainer());
  return (
    <div className="fm-stack fm-stack--3">
      <div className="fm-row fm-row--between">
        <h1>עולמות</h1>
        <span className="fm-small">ההגדרות ב־content/scenes/&lt;slug&gt;/scene.json · הכיבוי כאן הוא תפעולי בלבד</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="fm-table">
          <thead>
            <tr>
              <th></th>
              <th>עולם</th>
              <th>גרסה</th>
              <th>ארט</th>
              <th>פעיל</th>
              <th>אזהרות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ scene, warnings, override, effectiveActive }) => (
              <tr key={scene.slug}>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.art.thumbnail} alt="" width={96} height={60} style={{ borderRadius: 8 }} />
                </td>
                <td>
                  <strong>{scene.name.he}</strong>
                  <div className="fm-small">{scene.slug}</div>
                </td>
                <td>v{scene.version}</td>
                <td>
                  <span className={`fm-badge ${scene.artStatus === "final" ? "fm-badge--leaf" : scene.artStatus === "draft" ? "fm-badge--sea" : "fm-badge--outline"}`}>{scene.artStatus}</span>
                </td>
                <td>
                  <span className={`fm-badge ${effectiveActive ? "fm-badge--leaf" : "fm-badge--outline"}`}>{effectiveActive ? "פעיל" : "כבוי"}</span>
                  {!scene.active ? <div className="fm-small">כבוי בקובץ</div> : null}
                  {override && !override.active ? <div className="fm-small">כבוי באדמין{override.note ? `: ${override.note}` : ""}</div> : null}
                </td>
                <td>
                  {warnings.length === 0 ? (
                    <span className="fm-small">—</span>
                  ) : (
                    <ul className="fm-small" style={{ margin: 0, paddingInlineStart: 16 }}>
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <div className="fm-row">
                    <Link href={`/admin/scenes/${scene.slug}`} className="fm-btn fm-btn--secondary fm-btn--sm">
                      תצוגה
                    </Link>
                    {scene.active ? (
                      <form action={setSceneActiveAction}>
                        <input type="hidden" name="slug" value={scene.slug} />
                        <input type="hidden" name="active" value={effectiveActive ? "false" : "true"} />
                        <button className="fm-btn fm-btn--ghost fm-btn--sm" type="submit">
                          {effectiveActive ? "כיבוי" : "הפעלה"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
