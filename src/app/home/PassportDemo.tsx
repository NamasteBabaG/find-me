import { PassportBook } from "@/ui/passport/PassportBook";
import { demoPassport } from "@/domain/passport/demo";
import { getDict, type Locale } from "@/i18n";

export function PassportDemo({ locale }: { locale: Locale }) {
  const copy = getDict(locale).travelPassport;
  return <section className="fm-section passport-demo" aria-labelledby="passport-demo-title"><div className="fm-container"><header><p className="travel-passport__eyebrow">FIND ME WORLDS</p><h2 id="passport-demo-title">{copy.demoHeading}</h2><p>{copy.demoLead}</p></header><PassportBook book={demoPassport(locale)} mode="demo" /></div></section>;
}
