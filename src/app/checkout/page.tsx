import { redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { draftSummary } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { formatPriceILS, searchesFor } from "@/domain/package";
import { CreateFrame } from "../create/CreateLayout";
import { currentDraft } from "../create/actions";
import { CheckoutForm } from "./CheckoutForm";

export const metadata = { title: "סיכום ותשלום" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const c = getContainer();
  const [user, draft, params] = await Promise.all([currentUser(), currentDraft(), searchParams]);
  if (!draft?.childProfile) redirect("/create");
  const summary = await draftSummary(c, draft.id);
  if (!summary?.pkg || summary.scenes.length !== summary.pkg.sceneCount) redirect("/create/scenes");

  return (
    <CreateFrame step={4} title="סיכום ותשלום" lead="רגע לפני שהקסם מתחיל." user={user} isAdmin={isAdminEmail(user?.email)}>
      <div className="summary">
        <div className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
          <div className="fm-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/drafts/photo" alt="" className="fm-sticker" width={80} height={80} style={{ width: 80, height: 80 }} />
            <div>
              <h3>איפה {summary.child?.displayName}?</h3>
              <p className="fm-muted">
                {summary.pkg.name} · {summary.pkg.sceneCount} עולמות · {searchesFor(summary.pkg.tier)} חיפושים
              </p>
            </div>
          </div>
          <div className="summary__scenes">
            {summary.scenes.map((s) => (
              <span key={s.slug} className="fm-badge fm-badge--sea">
                {s.name}
              </span>
            ))}
          </div>
          <div>
            <div className="summary__row">
              <span>{summary.pkg.name}</span>
              <strong>{formatPriceILS(summary.pkg.priceAgorot)}</strong>
            </div>
            <div className="summary__row">
              <span>סה״כ לתשלום</span>
              <strong className="package__worlds">{formatPriceILS(summary.pkg.priceAgorot)}</strong>
            </div>
          </div>
          <p className="fm-small">המחיר כולל מע״מ. המשחק יישלח למייל ויישמר בספרייה הפרטית שלכם.</p>
        </div>
        <CheckoutForm defaultEmail={user?.email ?? ""} priceLabel={formatPriceILS(summary.pkg.priceAgorot)} cancelled={params.cancelled === "1"} />
      </div>
    </CreateFrame>
  );
}
