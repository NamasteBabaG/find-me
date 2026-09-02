import { getContainer } from "@/services/container";
import { costDashboard } from "@/services/admin.service";
import { formatMoney } from "@/domain/package";

export default async function AdminCostsPage() {
  const rows = await costDashboard(getContainer());
  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue[r.currency] += r.priceMinor;
      acc.cost += r.generationCents;
      return acc;
    },
    { revenue: { ILS: 0, USD: 0 }, cost: 0 },
  );
  const usd = (cents: number) => formatMoney(cents, "USD", "he");
  return (
    <div className="fm-stack fm-stack--3">
      <h1>עלויות</h1>
      <p className="fm-muted">
        יעד: עלות יצירה עד ~25% ממחיר החבילה. עלויות היצירה נמדדות בדולרים והרווח מחושב לפי שער משוער. עם ספק ה־mock העלות היא 0 — הטבלה מתמלאת ברגע שמחברים ספק אמיתי.
      </p>
      <div className="fm-row">
        <span className="fm-badge">משחקים: {rows.length}</span>
        <span className="fm-badge fm-badge--sea">
          הכנסות: {formatMoney(totals.revenue.ILS, "ILS", "he")} · {usd(totals.revenue.USD)}
        </span>
        <span className="fm-badge fm-badge--berry">עלות יצירה: {usd(totals.cost)}</span>
        <span className="fm-badge fm-badge--leaf">ממוצע: {usd(rows.length ? Math.round(totals.cost / rows.length) : 0)} למשחק</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="fm-table">
          <thead>
            <tr>
              <th>משחק</th>
              <th>מחיר</th>
              <th>עלות יצירה</th>
              <th>ניסיונות</th>
              <th>רווח משוער</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gameId}>
                <td>
                  {r.childName} <span className="fm-small">{r.gameId}</span>
                </td>
                <td>{formatMoney(r.priceMinor, r.currency, "he")}</td>
                <td>{usd(r.generationCents)}</td>
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
