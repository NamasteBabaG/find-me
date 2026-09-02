/**
 * Tiny template helper used for mission / success / hint copy.
 * Templates use `{name}` for the child's name. Copy is written to stay
 * gender-neutral in Hebrew (plural imperative "מצאו", child speaks in
 * first person), so no gender field is ever required.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export function fillAll(templates: readonly string[], vars: Record<string, string>): string[] {
  return templates.map((t) => fillTemplate(t, vars));
}

/** Display name is trimmed and capped so it never breaks a layout. */
export function normalizeChildName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 24);
}
