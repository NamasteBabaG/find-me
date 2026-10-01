import { notFound } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { legalDocuments, LEGAL_PATHS, type LegalPage, serviceCopy } from "@/domain/legal";
import { ServiceFrame } from "@/ui/ServicePages";
import { SupportForm } from "../support/SupportForm";

function pageOf(value: string): LegalPage {
  if (!LEGAL_PATHS.includes(value as LegalPage)) notFound();
  return value as LegalPage;
}

export async function generateMetadata({ params }: { params: Promise<{ document: string }> }) {
  const [{ document }, { locale }] = await Promise.all([params, getI18n()]);
  return { title: serviceCopy[locale][pageOf(document)] };
}

export default async function LegalDocument({ params }: { params: Promise<{ document: string }> }) {
  const [{ document }, { locale }] = await Promise.all([params, getI18n()]);
  const page = pageOf(document), content = legalDocuments[locale][page];
  return <ServiceFrame locale={locale} title={serviceCopy[locale][page]} lead={content.lead}>
    <nav className="service-toc" aria-label={locale === "he" ? "תוכן העמוד" : "On this page"}>
      {content.sections.map((section, i) => <a href={`#section-${i + 1}`} key={section.title}>{section.title}</a>)}
    </nav>
    <article className="service-document">
      {content.sections.map((section, i) => <section id={`section-${i + 1}`} key={section.title}>
        <h2>{section.title}</h2>{section.paragraphs.map(text => <p key={text}>{text}</p>)}
      </section>)}
    </article>
    {page === "cancellation" ? <SupportForm locale={locale} initialTopic="cancellation" /> : null}
  </ServiceFrame>;
}
