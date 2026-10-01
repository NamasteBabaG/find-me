import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { serviceCopy } from "@/domain/legal";
import { businessProfile } from "@/lib/business-profile";
import { SiteFooter, SiteHeader } from "./Shell";
import { currentUser, isAdminEmail } from "@/lib/server/session";

export function ServiceNavigation({ locale }: { locale: Locale }) {
  const copy = serviceCopy[locale];
  return <nav className="service-nav" aria-label={copy.navigation}>
    {(["support", "privacy", "terms", "cancellation", "accessibility"] as const).map(key => <Link key={key} href={`/${key}`}>{copy[key]}</Link>)}
  </nav>;
}

export function BusinessDetails({ locale }: { locale: Locale }) {
  const c = serviceCopy[locale], p = businessProfile();
  return <section className="service-business fm-card fm-card--pad-3" aria-labelledby="business-title">
    <h2 id="business-title">{c.business}</h2>
    <dl>
      <div><dt>{c.name}</dt><dd dir="ltr">{p.name}</dd></div>
      <div><dt>{c.number}</dt><dd>{p.number}</dd></div>
      <div><dt>{c.address}</dt><dd>{p.address}</dd></div>
      {p.email ? <div><dt>{c.email}</dt><dd><a href={`mailto:${p.email}`} dir="ltr">{p.email}</a></dd></div> : null}
      {p.phone ? <div><dt>{c.phone}</dt><dd><a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`} dir="ltr">{p.phone}</a></dd></div> : null}
      {p.hours ? <div><dt>{c.hours}</dt><dd>{p.hours}</dd></div> : null}
    </dl>
    {!p.complete ? <p className="fm-hint" role="note">{c.pending}</p> : null}
  </section>;
}

export async function ServiceFrame({ locale, title, lead, children }: { locale: Locale; title: string; lead: string; children: ReactNode }) {
  const user = await currentUser();
  return <><SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
    <main id="service-content" className="fm-container fm-section service-page">
      <header className="service-head"><p className="fm-hint">FindMe Worlds · {serviceCopy[locale].updated}</p><h1>{title}</h1><p className="fm-lead">{lead}</p></header>
      <ServiceNavigation locale={locale} />
      {children}
      <BusinessDetails locale={locale} />
    </main><SiteFooter /></>;
}
