import type { Dictionary } from "@/i18n/dictionaries/en";

export function QaWizardSimulationNotice({ t }: { t: Dictionary }) {
  return <p className="fm-center create__qa"><strong>{t.create.qaSimulation.title}</strong> {t.create.qaSimulation.description}</p>;
}
