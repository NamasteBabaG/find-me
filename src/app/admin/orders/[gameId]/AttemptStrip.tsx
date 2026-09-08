import type { AdminAttempt } from "@/services/admin.service";

/**
 * Every attempt of one hiding spot, stage by stage: what the painter drew,
 * what pass two answered, what was cut out, and the composite the judge was
 * shown — each with its own verdict. Before this the page showed the raw
 * renders under the caption "what the model painted", and a good render
 * whose matte or judge had failed looked like a bad painting.
 */
const STAGE_HE: Record<string, string> = {
  accepted: "התקבל",
  painter: "נדחה בציור (הצייר)",
  matte: "נדחה בחיתוך (מעבר שני)",
  geometry: "נדחה בגיאומטריה",
  judge: "נדחה בשיפוט",
  "judge-unknown": "מוחזק: השופט לא הכריע",
  pending: "ממתין להמשך",
  error: "שגיאה",
  unrecorded: "נדחה (שלב לא נרשם)",
  unknown: "לא ידוע",
};

function Thumb({ id, label }: { id: string | null; label: string }) {
  return (
    <figure className="fm-stack fm-stack--1" style={{ width: 96, margin: 0 }}>
      {id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${id}`} alt={label} style={{ width: 96, height: 96, objectFit: "contain", background: "var(--surface-2)", borderRadius: "var(--radius-2)" }} />
      ) : (
        <div className="fm-small" style={{ width: 96, height: 96, display: "grid", placeItems: "center", background: "var(--surface-2)", borderRadius: "var(--radius-2)" }}>
          לא נשמר
        </div>
      )}
      <figcaption className="fm-small">{label}</figcaption>
    </figure>
  );
}

export function AttemptStrip({ attempts }: { attempts: AdminAttempt[] }) {
  if (attempts.length === 0) return <span className="fm-small">אין ניסיונות רשומים ביומן.</span>;
  return (
    <div className="fm-stack fm-stack--2">
      {attempts.map((a) => (
        <div key={a.n} className="fm-stack fm-stack--1" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-1)" }}>
          <div className="fm-row fm-row--between">
            <strong>
              ניסיון {a.n} · {STAGE_HE[a.stage] ?? a.stage}
            </strong>
            <span className="fm-small">{(a.cents / 100).toFixed(3)} USD</span>
          </div>
          {a.problem ? (
            <span className="fm-small" dir="ltr">
              {a.problem}
            </span>
          ) : null}
          <div className="fm-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
            <Thumb id={a.renderAssetId} label="הציור" />
            {a.matteAssetIds.length > 0 ? a.matteAssetIds.map((id, i) => <Thumb key={id} id={id} label={`מעבר שני ${i + 1}`} />) : <Thumb id={null} label="מעבר שני" />}
            <Thumb id={a.patchAssetId} label="החיתוך" />
            <Thumb id={a.compositeAssetId} label="מה שהשופט ראה" />
          </div>
          {a.judge ? (
            <div className="fm-small" dir="ltr">
              judge: <b>{a.judge.verdict}</b>
              {a.judge.model ? ` · ${a.judge.model}` : ""}
              {a.judge.policy ? ` · ${a.judge.policy}` : ""}
              {a.judge.checks ? ` · ${Object.entries(a.judge.checks).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}
              {a.judge.reason ? <div title={a.judge.reason}>{a.judge.reason.slice(0, 240)}</div> : null}
              {a.judge.reviews?.map((r, i) => (
                <div key={i}>
                  {r.model ?? "?"}: <b>{r.verdict}</b> — {r.reason.slice(0, 160)}
                </div>
              ))}
            </div>
          ) : a.stage === "accepted" || a.stage === "judge" ? (
            <span className="fm-small">השיפוט של הניסיון הזה לא נשמר (נרשם לפני 8.9.2026).</span>
          ) : null}
          {a.hiddenFraction !== null ? <span className="fm-small">שכבת החזית מסתירה {Math.round(a.hiddenFraction * 100)}% מהילד/ה שצוירו.</span> : null}
        </div>
      ))}
    </div>
  );
}
