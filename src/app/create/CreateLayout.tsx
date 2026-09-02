import type { ReactNode } from "react";
import { SiteHeader } from "@/ui/Shell";
import { Stepper } from "@/ui/Shell";

export const CREATE_STEPS = ["מי מתחבא?", "תמונה", "כמה עולמות?", "אילו עולמות?", "סיכום ותשלום"];

export function CreateFrame({ step, title, lead, user, isAdmin, children }: { step: number; title: string; lead?: string; user: { email: string } | null; isAdmin: boolean; children: ReactNode }) {
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdmin} />
      <main className="fm-container fm-container--narrow fm-section create">
        <Stepper steps={CREATE_STEPS} current={step} />
        <div className="create__head">
          <h1 className="create__title">{title}</h1>
          {lead ? <p className="fm-lead">{lead}</p> : null}
        </div>
        {children}
      </main>
    </>
  );
}
