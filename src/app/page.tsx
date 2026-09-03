import { SCENE_CATALOG } from "../../content/scenes";
import { buildDemoConfig } from "@/services/demo";
import { getContainer } from "@/services/container";
import { activeSceneSlugs } from "@/services/scene-catalog.service";
import { purchasableWorldSlugs } from "@/services/world-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getCurrency, getI18n } from "@/i18n/server";
import { SiteFooter, SiteHeader } from "@/ui/Shell";
import { Hero } from "./home/Hero";
import { DemoSection } from "./home/DemoSection";
import { Transformation } from "./home/Transformation";
import { FinalCta } from "./home/FinalCta";
import { Faq, GiftSection, HowItWorks, Inside, Marquee, Pricing, Trust, Worlds } from "./home/sections";

export default async function HomePage() {
  const c = getContainer();
  const [user, active, worlds, { locale, t }, currency] = await Promise.all([currentUser(), activeSceneSlugs(c), purchasableWorldSlugs(c), getI18n(), getCurrency()]);
  const scenes = SCENE_CATALOG.map((e) => e.scene);
  const demo = buildDemoConfig(locale, "beach");

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main>
        <Hero>
          <Marquee scenes={scenes} locale={locale} />
        </Hero>
        <DemoSection config={demo} />
        <Transformation />
        <HowItWorks t={t} locale={locale} />
        <Inside t={t} locale={locale} />
        <GiftSection t={t} locale={locale} />
        <Worlds t={t} locale={locale} scenes={scenes} activeSlugs={active} />
        <Pricing t={t} locale={locale} activeCount={worlds.length} currency={currency} />
        <Trust t={t} locale={locale} />
        <Faq t={t} locale={locale} />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
