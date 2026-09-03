import type { ReactNode } from "react";
import { getI18n } from "@/i18n/server";
import { SiteHeader, Stepper } from "@/ui/Shell";
import { ScrollToTop } from "./ScrollToTop";

export async function CreateFrame({ step, title, lead, user, isAdmin, children }: { step: number; title: string; lead?: string; user: { email: string } | null; isAdmin: boolean; children: ReactNode }) {
  const { t } = await getI18n();
  return (
    <>
      <ScrollToTop />
      <SiteHeader user={user} isAdmin={isAdmin} />
      <main className="fm-container fm-container--narrow fm-section create">
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
