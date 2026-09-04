import type { LocalizedText } from "@/i18n/config";

/**
 * Worlds that are being made, described so the shop can show them before they
 * exist.
 *
 * A world in the catalog needs nine painted boards and a map, so it cannot be
 * listed until it is finished — but a parent deciding between packages should
 * see what the second and third worlds are, or the ladder is invisible and
 * "three worlds" is just a bigger number. These entries carry no art on
 * purpose: a teased world that shows a painting nobody can play is a promise,
 * and the tiles say plainly that it is being painted.
 *
 * When a world here is finished, it moves to `content/worlds/<slug>/world.json`
 * and is deleted from this list.
 */
export interface UpcomingWorld {
  slug: string;
  order: number;
  name: LocalizedText;
  tagline: LocalizedText;
  /** Nine short place names, so the tiles are not nine question marks. */
  places: LocalizedText[];
  /**
   * The board slugs, in the same order as `places`.
   *
   * A locked world shows its real paintings, blurred, as soon as they exist:
   * a gradient with a place name promises something, a blurred painting shows
   * that it is already there. The blur is a curtain and not a lock, which is
   * fine — the boards are the shop window, and what is actually bought is a
   * child painted into them.
   */
  boards?: string[];
  palette: { sky: string; ground: string; accent: string };
  glyph: string;
}

const t = (en: string, he: string): LocalizedText => ({ en, he });

export const UPCOMING_WORLDS: readonly UpcomingWorld[] = [
  {
    slug: "timetravel",
    order: 3,
    name: t("Journey Through Time", "מסע בזמן"),
    tagline: t("Dinosaurs, pirates and a city that has not been built yet.", "דינוזאורים, פיראטים ועיר שעוד לא נבנתה."),
    places: [
      t("The valley of dinosaurs", "עמק הדינוזאורים"),
      t("The pyramid builders", "בוני הפירמידות"),
      t("The knights' tournament", "טורניר האבירים"),
      t("The pirate cove", "מפרץ הפיראטים"),
      t("The wild west", "המערב הפרוע"),
      t("The steam railway", "רכבת הקיטור"),
      t("The future city", "העיר העתידנית"),
      t("The robot workshop", "מעבדת הרובוטים"),
      t("Beyond the stars", "מעבר לכוכבים"),
    ],
    palette: { sky: "#8FD6E8", ground: "#2E5F6E", accent: "#FF8A3D" },
    glyph: "⏳",
  },
];
