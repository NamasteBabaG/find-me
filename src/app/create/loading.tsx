"use client";

import { useI18n } from "@/i18n/client";

export default function CreateLoading() {
  const { t } = useI18n();
  return <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3 fm-center" aria-busy="true">
    <p role="status"><span className="fm-spinner" aria-hidden="true" /> {t.common.savingStep}</p>
    <div className="fm-card fm-card--pad-6" aria-hidden="true"><div className="create__loading-line" /><div className="create__loading-line" /><div className="create__loading-line" /></div>
  </main>;
}
