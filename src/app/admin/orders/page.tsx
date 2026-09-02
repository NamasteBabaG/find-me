import Link from "next/link";
import { getContainer } from "@/services/container";
import { countsForAdmin, listOrdersForAdmin, type AdminFilter } from "@/services/admin.service";
import { formatPriceILS } from "@/domain/package";

const FILTERS: Array<[AdminFilter, string]> = [
  ["new", "חדשות"],
  ["pending_payment", "ממתינות לתשלום"],
  ["generating", "בתהליך יצירה"],
  ["qa", "דורשות בדיקה"],
  ["needs_photo", "דורשות תמונה"],
  ["ready", "מוכנות"],
  ["failed", "נכשלו"],
  ["refunded", "הוחזרו"],
  ["all", "הכול"],
];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter = (FILTERS.some(([k]) => k === f) ? f : "qa") as AdminFilter;
  const c = getContainer();
  const [rows, counts] = await Promise.all([listOrdersForAdmin(c, filter), countsForAdmin(c)]);
  return (
    <div className="fm-stack fm-stack--3">
      <h1>הזמנות</h1>
      <div className="admin__filters">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/admin/orders?f=${key}`} className={`fm-badge ${key === filter ? "fm-badge--ink" : "fm-badge--outline"}`}>
            {label} · {counts[key]}
          </Link>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="fm-table">
          <thead>
            <tr>
              <th>ילד/ה</th>
              <th>מייל</th>
              <th>סטטוס</th>
              <th>חבילה</th>
              <th>תשלום</th>
              <th>עודכן</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="fm-center fm-muted">
                  אין הזמנות בסינון הזה.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.gameId}>
                <td>{r.childName}</td>
                <td dir="ltr">{r.email}</td>
                <td>
                  <span className="fm-badge fm-badge--outline">{r.status}</span>
                  {r.lastError ? <div className="fm-error">{r.lastError}</div> : null}
                </td>
                <td>
                  {r.packageTier} · {r.sceneCount}
                </td>
                <td>
                  {formatPriceILS(r.amountAgorot)} · {r.paymentStatus}
                </td>
                <td>{r.updatedAt.toLocaleString("he-IL")}</td>
                <td>
                  <Link href={`/admin/orders/${r.gameId}`} className="fm-btn fm-btn--secondary fm-btn--sm">
                    פתיחה
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
