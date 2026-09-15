import templates from './beach-v1-game.json';
import { GameConfigSchema, type GameConfig } from '../../src/domain/game/config';
import type { Locale } from '../../src/i18n/config';

/** One reviewed public example. Clone before naming: server requests cannot
 * mutate the next visitor's game. No catalog, DB, secrets or generation. */
export function publicBeachDemo(locale: Locale, name?: string): GameConfig {
  const config = GameConfigSchema.parse(templates[locale]);
  if (name) {
    config.child.name = name;
    for (const target of config.scenes[0]!.targets) target.mission = locale === 'he' ? `מצאו את ${name}` : `Find ${name}`;
  }
  return config;
}
