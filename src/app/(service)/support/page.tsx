import { getI18n } from "@/i18n/server";
import { serviceCopy } from "@/domain/legal";
import { ServiceFrame } from "@/ui/ServicePages";
import { SupportForm } from "./SupportForm";

export async function generateMetadata() { const { locale } = await getI18n(); return { title: serviceCopy[locale].support }; }
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { locale } = await getI18n(), c = serviceCopy[locale];
  const order = (await searchParams).order?.slice(0, 160) ?? "";
  return <ServiceFrame locale={locale} title={c.support} lead={c.supportLead}>
    <p>{c.fallback}</p><SupportForm locale={locale} initialOrder={order} />
  </ServiceFrame>;
}
