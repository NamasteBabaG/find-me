import type { ReactNode } from "react";
import { getI18n } from "@/i18n/server";
import { SiteHeader, Stepper } from "@/ui/Shell";
import { ScrollToTop } from "./ScrollToTop";

/**
 * A step that shows a form is read at a form's width; a step that shows three
 * cards side by side is not. At 880px the world cards were 270px wide with a
 * 3:2 painting squeezed into each, and the checkout summary and its pay card
 * fought over the same 880. `width="mid"` gives those steps 1120px; the title
 * and lead stay a paragraph wide inside it.
 */
export async function CreateFrame({ step, title, lead, user, isAdmin, width = "narrow", children }: { step: number; title: string; lead?: string; user: { email: string } | null; isAdmin: boolean; width?: "narrow" | "mid"; children: ReactNode }) {
  const { t } = await getI18n();
  return (
    <>
      <ScrollToTop />
      <SiteHeader user={user} isAdmin={isAdmin} />
      <main className={`fm-container fm-container--${width} fm-section create create--${width}`}>
        <Stepper steps={t.create.steps} current={step} />
        <div className="create__head">
          <h1 className="create__title">{title}</h1>
          {lead ? <p className="fm-lead">{lead}</p> : null}
        </div>
        {children}
      </main>
    </>
  );
}
