"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";

export function FinalCta() {
  const { t } = useI18n();
  const f = t.home.final;
  return (
    <section className="final">
      <div className="fm-container">
        <div className="fm-sheet final__sheet">
          <span className="fm-sticker-badge">{f.badge}</span>
          <h2 className="final__title">{f.title}</h2>
          <p className="final__lead">{f.lead}</p>
          <div className="final__cta fm-row fm-row--center">
            <Link href="/create" className="fm-btn fm-btn--night fm-btn--lg">
              {f.cta}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </Link>
            <a href="#pricing" className="fm-btn fm-btn--white fm-btn--lg">
              {f.pricing}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
