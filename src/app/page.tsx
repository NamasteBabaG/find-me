import { SCENE_CATALOG } from "../../content/scenes";
import { buildDemoConfig } from "@/services/demo";
import { getContainer } from "@/services/container";
import { activeSceneSlugs } from "@/services/scene-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { pick } from "@/i18n";
import { SiteFooter, SiteHeader } from "@/ui/Shell";
import { Hero } from "./home/Hero";
import { DemoSection } from "./home/DemoSection";
import { FinalCta } from "./home/FinalCta";
import { Faq, GiftSection, HowItWorks, Inside, Marquee, Pricing, Trust, Worlds } from "./home/sections";

export default async function HomePage() {
  const c = getContainer();
  const [user, active, { locale, t }] = await Promise.all([currentUser(), activeSceneSlugs(c), getI18n()]);
  const scenes = SCENE_CATALOG.map((e) => e.scene);
  const demo = buildDemoConfig(locale, "beach");
  const heroWorlds = scenes
    .filter((s) => active.includes(s.slug))
    .slice(0, 3)
    .map((s) => ({ slug: s.slug, name: pick(s.name, locale), thumbnail: s.art.thumbnail }));

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main>
        <Hero worlds={heroWorlds} />
        <Marquee scenes={scenes} locale={locale} />
        <DemoSection config={demo} />
        <HowItWorks t={t} locale={locale} />
        <Inside t={t} locale={locale} />
        <GiftSection t={t} locale={locale} />
        <Worlds t={t} locale={locale} scenes={scenes} activeSlugs={active} />
        <Pricing t={t} locale={locale} activeCount={active.length} />
        <Trust t={t} locale={locale} />
        <Faq t={t} locale={locale} />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
