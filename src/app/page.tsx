import { SCENE_CATALOG } from "../../content/scenes";
import { buildDemoConfig } from "@/services/demo";
import { getContainer } from "@/services/container";
import { activeSceneSlugs } from "@/services/scene-catalog.service";
import { boardsOfWorlds, ownedWorldSlugs, purchasableWorldSlugs } from "@/services/world-catalog.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getCurrency, getI18n } from "@/i18n/server";
import { SiteFooter, SiteHeader } from "@/ui/Shell";
import { Hero } from "./home/Hero";
import { DemoSection } from "./home/DemoSection";
import { Transformation } from "./home/Transformation";
import { FinalCta } from "./home/FinalCta";
import { Faq, GiftSection, HowItWorks, Inside, Marquee, Pricing, Trust, Worlds } from "./home/sections";
import { carouselWorlds } from "./home/worlds-data";

export default async function HomePage() {
  const c = getContainer();
  const [user, active, worlds, { locale, t }, currency] = await Promise.all([currentUser(), activeSceneSlugs(c), purchasableWorldSlugs(c), getI18n(), getCurrency()]);
  // What this visitor already paid for, so a world they own is never shown locked.
  const owned = await ownedWorldSlugs(c, user?.id);
  // Only what a parent can actually buy today — the boards of the worlds that
  // are for sale. "Active" is not the same thing: the catalog also holds boards
  // retired from world 1, and a finished world that is not yet on sale. Both
  // were being counted in the headline and scrolled past in the hero marquee.
  const sellable = new Set(boardsOfWorlds(worlds));
  const scenes = SCENE_CATALOG.map((e) => e.scene).filter((s) => sellable.has(s.slug));
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
        <Worlds t={t} locale={locale} scenes={scenes} activeSlugs={[...sellable]} carousel={carouselWorlds(locale, owned)} />
        <GiftSection t={t} locale={locale} />
        <Pricing t={t} locale={locale} activeCount={worlds.length} currency={currency} />
        <Trust t={t} locale={locale} />
        <Faq t={t} locale={locale} />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
