import { getContainer } from "@/services/container";
import { costDashboard } from "@/services/admin.service";
import { formatPriceILS } from "@/domain/package";

export default async function AdminCostsPage() {
  const rows = await costDashboard(getContainer());
  const totals = rows.reduce((acc, r) => ({ price: acc.price + r.priceAgorot, cost: acc.cost + r.generationCents }), { price: 0, cost: 0 });
  return (
    <div className="fm-stack fm-stack--3">
      <h1>עלויות</h1>
      <p className="fm-muted">יעד: עלות יצירה עד ~25% ממחיר החבילה. עם ספק ה־mock העלות היא 0 — הטבלה מתמלאת ברגע שמחברים ספק אמיתי.</p>
      <div className="fm-row">
        <span className="fm-badge">משחקים: {rows.length}</span>
        <span className="fm-badge fm-badge--sea">הכנסות: {formatPriceILS(totals.price)}</span>
        <span className="fm-badge fm-badge--berry">עלות יצירה: {(totals.cost / 100).toFixed(2)} ₪</span>
        <span className="fm-badge fm-badge--leaf">ממוצע: {rows.length ? (totals.cost / rows.length / 100).toFixed(2) : "0.00"} ₪ למשחק</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="fm-table">
          <thead>
            <tr>
              <th>משחק</th>
              <th>מחיר</th>
              <th>עלות יצירה</th>
              <th>ניסיונות</th>
              <th>Margin לפני פרסום</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gameId}>
                <td>
                  {r.childName} <span className="fm-small">{r.gameId}</span>
                </td>
                <td>{formatPriceILS(r.priceAgorot)}</td>
                <td>{(r.generationCents / 100).toFixed(2)} ₪</td>
                <td>{r.attempts}</td>
                <td>{r.marginPct === null ? "—" : `${r.marginPct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
