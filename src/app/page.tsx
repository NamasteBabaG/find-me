import { SCENE_CATALOG } from "../../content/scenes";
import { buildDemoConfig } from "@/services/demo";
import { getContainer } from "@/services/container";
import { boardsOfWorlds, ownedWorldSlugs } from "@/services/world-catalog.service";
import { availablePackages, newDraftStyleVersion, worldsForDraft } from "@/services/create-flow.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getCurrency, getI18n } from "@/i18n/server";
import { SiteFooter, SiteHeader } from "@/ui/Shell";
import { Hero } from "./home/Hero";
import { DemoSection } from "./home/DemoSection";
import { PassportDemo } from "./home/PassportDemo";
import { Transformation } from "./home/Transformation";
import { FinalCta } from "./home/FinalCta";
import { Faq, GiftSection, HowItWorks, Inside, Marquee, Pricing, Trust, Worlds } from "./home/sections";
import { carouselWorlds } from "./home/worlds-data";
import { qaAccessConfig } from "@/lib/qa-access";
import { HomeQaRecovery } from "@/ui/qa/HomeQaRecovery";

export default async function HomePage() {
  const c = getContainer();
  const styleVersion = newDraftStyleVersion();
  const [user, offeredWorlds, { locale, t }, currency] = await Promise.all([currentUser(), worldsForDraft(c, styleVersion), getI18n(), getCurrency()]);
  const worlds = offeredWorlds.map(w => w.slug);
  // What this visitor already paid for, so a world they own is never shown locked.
  const [owned, packages] = await Promise.all([
    ownedWorldSlugs(c, user?.id), availablePackages(c, styleVersion, worlds.length),
  ]);
  // Only what a parent can actually buy today — the boards of the worlds that
  // are for sale. "Active" is not the same thing: the catalog also holds boards
  // retired from world 1, and a finished world that is not yet on sale. Both
  // were being counted in the headline and scrolled past in the hero marquee.
  const sellable = new Set(boardsOfWorlds(worlds));
  const scenes = SCENE_CATALOG.map((e) => e.scene).filter((s) => sellable.has(s.slug));
  const demo = buildDemoConfig(locale, "beach");

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} clear />
      <HomeQaRecovery enabled={qaAccessConfig().enabled}><main>
        <Hero child={demo.child}>
          <Marquee scenes={scenes} locale={locale} />
        </Hero>
        {/* The three visual steps (photo → character → world) directly precede the live demo. */}
        <Transformation />
        <DemoSection config={demo} />
        <PassportDemo locale={locale} />
        <HowItWorks t={t} locale={locale} />
        <Inside t={t} locale={locale} />
        <Worlds t={t} carousel={carouselWorlds(locale, owned, { available: worlds })} />
        <GiftSection t={t} locale={locale} />
        <Pricing t={t} locale={locale} allowedTiers={packages.map(pkg => pkg.tier)} currency={currency} />
        <Trust t={t} locale={locale} />
        <Faq t={t} locale={locale} />
        <FinalCta />
      </main></HomeQaRecovery>
      <SiteFooter />
    </>
  );
}
