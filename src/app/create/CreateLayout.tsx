import type { ReactNode } from "react";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { SiteHeader, SiteFooter, Stepper } from "@/ui/Shell";
import { ScrollToTop } from "./ScrollToTop";
import { Button, LinkButton } from "@/ui/Button";
import { purchasingEnabled } from "@/lib/purchasing";
import type { Dictionary } from "@/i18n/dictionaries/en";

export function CreationPrelaunchNotice({ t, heading = "h1" }: { t: Dictionary; heading?: "h1" | "h2" }) {
  const Heading = heading;
  return <div className="fm-stack fm-stack--3 fm-center">
    <Heading className="create__title">{t.create.prelaunch.title}</Heading>
    <p className="fm-lead">{t.errors.PURCHASING_CLOSED}</p>
    <Button disabled size="lg">{t.create.prelaunch.action}</Button>
    <LinkButton href="/#demo" variant="secondary" size="lg">{t.nav.demo}</LinkButton>
  </div>;
}

export async function CreationPrelaunch({ user = null, isAdmin = false }: { user?: { email: string } | null; isAdmin?: boolean }) {
  const { t } = await getI18n();
  return <><SiteHeader user={user} isAdmin={isAdmin} />
    <main className="fm-container fm-container--narrow fm-section create"><CreationPrelaunchNotice t={t} /></main>
    <SiteFooter />
  </>;
}

/**
 * A step that shows a form is read at a form's width; a step that shows three
 * cards side by side is not. At 880px the world cards were 270px wide with a
 * 3:2 painting squeezed into each, and the checkout summary and its pay card
 * fought over the same 880. `width="mid"` gives those steps 1120px; the title
 * and lead stay a paragraph wide inside it.
 */
export async function CreateFrame({ step, title, lead, user, isAdmin, width = "narrow", children }: { step: number; title: string; lead?: string; user: { email: string } | null; isAdmin: boolean; width?: "narrow" | "mid"; children: ReactNode }) {
  if (!purchasingEnabled()) return <CreationPrelaunch user={user} isAdmin={isAdmin} />;
  const { t } = await getI18n();
  return (
    <>
      <ScrollToTop />
      <SiteHeader user={user} isAdmin={isAdmin} />
      <main className={`fm-container fm-container--${width} fm-section create create--${width}`}>
        <Stepper steps={t.create.steps} current={step} count={tf(t.common.stepOf, { n: step + 1, total: t.create.steps.length })} />
        <div className="create__head">
          <h1 className="create__title">{title}</h1>
          {lead ? <p className="fm-lead">{lead}</p> : null}
        </div>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
