/**
 * Body templates — fixed illustrated bodies the child's face sticker is
 * composed onto. This is the cost lever from the spec: one avatar per child
 * + reusable bodies, instead of three fresh generations per world.
 *
 * Today the renderer draws these procedurally (ComposedSprite) so the game
 * is playable with zero image generation. When real illustrated bodies
 * exist, add `art` (transparent PNG + face anchor) and the renderer will
 * prefer it automatically.
 */
import type { LocalizedText } from "@/i18n/config";

export type BodyPose = "standing" | "sitting" | "peeking" | "holding" | "floating" | "waving" | "riding" | "saluting";

export interface BodyTemplate {
  id: string;
  label: LocalizedText;
  pose: BodyPose;
  /** Emoji/glyph stand-in for the accessory until illustrated bodies exist. */
  accessory: { glyph: string; place: "hand" | "head" | "body" | "front" | "none" };
  outfit: { primary: string; secondary: string };
  /** Optional illustrated body (future). Face anchor in template units (0..1). */
  art?: { src: string; width: number; height: number; face: { x: number; y: number; r: number } };
}

const t = (en: string, he: string): LocalizedText => ({ en, he });

export const BODY_TEMPLATES: Record<string, BodyTemplate> = {
  // ── world 1: destinations ──
  amazon_canoe: { id: "amazon_canoe", label: t("in a wooden canoe", "בקאנו מעץ"), pose: "riding", accessory: { glyph: "🛶", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#FFF8EC" } },
  amazon_macaw: { id: "amazon_macaw", label: t("with a macaw", "עם תוכי"), pose: "holding", accessory: { glyph: "🦜", place: "hand" }, outfit: { primary: "#F25C7A", secondary: "#5BBF6B" } },
  amazon_roots: { id: "amazon_roots", label: t("behind giant roots", "מאחורי שורשים ענקיים"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#5BBF6B", secondary: "#C9A227" } },
  paris_bakery: { id: "paris_bakery", label: t("with a baguette", "עם באגט"), pose: "holding", accessory: { glyph: "🥖", place: "hand" }, outfit: { primary: "#C1443B", secondary: "#FFF8EC" } },
  paris_carousel: { id: "paris_carousel", label: t("on the carousel", "על הקרוסלה"), pose: "riding", accessory: { glyph: "🎠", place: "front" }, outfit: { primary: "#8C6BD9", secondary: "#FFB61E" } },
  paris_awning: { id: "paris_awning", label: t("behind a café awning", "מאחורי סוכך של בית קפה"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#2FA4D6", secondary: "#F25C7A" } },
  marrakech_lanterns: { id: "marrakech_lanterns", label: t("under the lanterns", "מתחת לפנסים"), pose: "standing", accessory: { glyph: "🏮", place: "front" }, outfit: { primary: "#F25C7A", secondary: "#FFB61E" } },
  marrakech_carpets: { id: "marrakech_carpets", label: t("between the carpets", "בין השטיחים"), pose: "peeking", accessory: { glyph: "🧶", place: "body" }, outfit: { primary: "#C1443B", secondary: "#2FA4D6" } },
  marrakech_spices: { id: "marrakech_spices", label: t("behind the spice cones", "מאחורי חרוטי התבלינים"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#C9A227", secondary: "#5BBF6B" } },
  giza_camel: { id: "giza_camel", label: t("on a camel", "על גמל"), pose: "riding", accessory: { glyph: "🐫", place: "front" }, outfit: { primary: "#C9A227", secondary: "#F25C7A" } },
  giza_stall: { id: "giza_stall", label: t("by the scarf stall", "ליד דוכן הצעיפים"), pose: "standing", accessory: { glyph: "🧣", place: "hand" }, outfit: { primary: "#8C6BD9", secondary: "#FFB61E" } },
  giza_stones: { id: "giza_stones", label: t("behind the big stones", "מאחורי אבני הענק"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#B9A98F", secondary: "#2FA4D6" } },
  tokyo_crossing: { id: "tokyo_crossing", label: t("at the crossing", "בצומת"), pose: "standing", accessory: { glyph: "🚦", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#FFF8EC" } },
  tokyo_stall: { id: "tokyo_stall", label: t("by a festival stall", "ליד דוכן פסטיבל"), pose: "holding", accessory: { glyph: "🎏", place: "hand" }, outfit: { primary: "#F25C7A", secondary: "#FFB61E" } },
  tokyo_blossom: { id: "tokyo_blossom", label: t("under the blossom tree", "מתחת לעץ הפריחה"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#F7C6D9", secondary: "#5BBF6B" } },
  greatwall_dragon: { id: "greatwall_dragon", label: t("under the paper dragon", "מתחת לדרקון הנייר"), pose: "standing", accessory: { glyph: "🐉", place: "front" }, outfit: { primary: "#C1443B", secondary: "#FFB61E" } },
  greatwall_lanterns: { id: "greatwall_lanterns", label: t("by the red lanterns", "ליד הפנסים האדומים"), pose: "holding", accessory: { glyph: "🏮", place: "hand" }, outfit: { primary: "#F25C7A", secondary: "#C9A227" } },
  greatwall_tower: { id: "greatwall_tower", label: t("in the watchtower", "במגדל השמירה"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#B9A98F", secondary: "#5BBF6B" } },
  sydney_ferry: { id: "sydney_ferry", label: t("on the ferry", "על המעבורת"), pose: "riding", accessory: { glyph: "⛴️", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#5BBF6B" } },
  sydney_surfboards: { id: "sydney_surfboards", label: t("by the surfboards", "ליד הגלשנים"), pose: "standing", accessory: { glyph: "🏄", place: "front" }, outfit: { primary: "#FFB61E", secondary: "#F25C7A" } },
  sydney_rocks: { id: "sydney_rocks", label: t("behind the harbour rocks", "מאחורי סלעי המפרץ"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#B9A98F", secondary: "#2FA4D6" } },
  antarctica_penguins: { id: "antarctica_penguins", label: t("among the penguins", "בין הפינגווינים"), pose: "standing", accessory: { glyph: "🐧", place: "front" }, outfit: { primary: "#FFF8EC", secondary: "#2B2B2B" } },
  antarctica_sledge: { id: "antarctica_sledge", label: t("on a sledge", "על מזחלת"), pose: "riding", accessory: { glyph: "🛷", place: "front" }, outfit: { primary: "#C1443B", secondary: "#2FA4D6" } },
  antarctica_ice: { id: "antarctica_ice", label: t("behind a block of ice", "מאחורי גוש קרח"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#BFE9FF", secondary: "#FFF8EC" } },
  // ── new york ──
  newyork_taxi: { id: "newyork_taxi", label: t("by a yellow taxi", "ליד מונית צהובה"), pose: "standing", accessory: { glyph: "🚕", place: "front" }, outfit: { primary: "#F5B301", secondary: "#2B2B2B" } },
  newyork_pretzel: { id: "newyork_pretzel", label: t("with a warm pretzel", "עם בייגלה חם"), pose: "holding", accessory: { glyph: "🥨", place: "hand" }, outfit: { primary: "#C1443B", secondary: "#FFF8EC" } },
  newyork_bench_peek: { id: "newyork_bench_peek", label: t("behind a park bench", "מאחורי ספסל בפארק"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#5BBF6B", secondary: "#C9A227" } },
  // ── beach ──
  beach_float: { id: "beach_float", label: t("with a float ring", "עם גלגל ים"), pose: "standing", accessory: { glyph: "🛟", place: "body" }, outfit: { primary: "#FFB61E", secondary: "#F25C7A" } },
  beach_sandcastle: { id: "beach_sandcastle", label: t("building a sandcastle", "בונה ארמון חול"), pose: "sitting", accessory: { glyph: "🏰", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#FFF8EC" } },
  beach_umbrella_peek: { id: "beach_umbrella_peek", label: t("peeking from behind a parasol", "מציץ/ה מאחורי שמשייה"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#5BBF6B", secondary: "#FFB61E" } },
  // ── jungle ──
  jungle_binoculars: { id: "jungle_binoculars", label: t("with binoculars", "עם משקפת"), pose: "holding", accessory: { glyph: "🔭", place: "hand" }, outfit: { primary: "#C9A227", secondary: "#5BBF6B" } },
  jungle_boat: { id: "jungle_boat", label: t("in a little boat", "בסירה קטנה"), pose: "riding", accessory: { glyph: "🛶", place: "front" }, outfit: { primary: "#F25C7A", secondary: "#FFF8EC" } },
  jungle_leaf_peek: { id: "jungle_leaf_peek", label: t("behind a giant leaf", "מאחורי עלה ענק"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#FFB61E", secondary: "#2FA4D6" } },
  // ── space ──
  space_astronaut: { id: "space_astronaut", label: t("in a spacesuit", "בחליפת אסטרונאוט"), pose: "floating", accessory: { glyph: "🪐", place: "hand" }, outfit: { primary: "#FFFFFF", secondary: "#8C6BD9" } },
  space_rover: { id: "space_rover", label: t("in a moon rover", "ברכב ירח"), pose: "riding", accessory: { glyph: "🚙", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#FFFFFF" } },
  space_aliens: { id: "space_aliens", label: t("next to aliens", "ליד חייזרים"), pose: "waving", accessory: { glyph: "👽", place: "hand" }, outfit: { primary: "#5BBF6B", secondary: "#FFB61E" } },
  // ── stadium ──
  stadium_scarf: { id: "stadium_scarf", label: t("with a scarf", "עם צעיף"), pose: "standing", accessory: { glyph: "🧣", place: "body" }, outfit: { primary: "#F25C7A", secondary: "#FFFFFF" } },
  stadium_ball: { id: "stadium_ball", label: t("holding a ball", "מחזיק/ה כדור"), pose: "holding", accessory: { glyph: "⚽", place: "hand" }, outfit: { primary: "#2FA4D6", secondary: "#FFFFFF" } },
  stadium_flag: { id: "stadium_flag", label: t("waving a flag", "מנופף/ת בדגל"), pose: "waving", accessory: { glyph: "🚩", place: "hand" }, outfit: { primary: "#FFB61E", secondary: "#2B2A33" } },
  // ── city ──
  city_bus: { id: "city_bus", label: t("next to the bus", "ליד האוטובוס"), pose: "standing", accessory: { glyph: "🎒", place: "body" }, outfit: { primary: "#F25C7A", secondary: "#FFB61E" } },
  city_scooter: { id: "city_scooter", label: t("on a scooter", "על קורקינט"), pose: "riding", accessory: { glyph: "🛴", place: "front" }, outfit: { primary: "#5BBF6B", secondary: "#2B2A33" } },
  city_window: { id: "city_window", label: t("waving from a window", "מנופף/ת מחלון"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#2FA4D6", secondary: "#FFFFFF" } },
  // ── market ──
  market_watermelon: { id: "market_watermelon", label: t("with a watermelon", "עם אבטיח"), pose: "holding", accessory: { glyph: "🍉", place: "hand" }, outfit: { primary: "#5BBF6B", secondary: "#F25C7A" } },
  market_flowers: { id: "market_flowers", label: t("by the flowers", "ליד הפרחים"), pose: "standing", accessory: { glyph: "💐", place: "hand" }, outfit: { primary: "#FFB61E", secondary: "#8C6BD9" } },
  market_spices_peek: { id: "market_spices_peek", label: t("behind spice sacks", "מאחורי שקי תבלינים"), pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#C9A227", secondary: "#F25C7A" } },
  // ── park ──
  park_kite: { id: "park_kite", label: t("flying a kite", "מעיף/ה עפיפון"), pose: "waving", accessory: { glyph: "🪁", place: "hand" }, outfit: { primary: "#2FA4D6", secondary: "#FFB61E" } },
  park_picnic: { id: "park_picnic", label: t("by the picnic", "ליד הפיקניק"), pose: "sitting", accessory: { glyph: "🧺", place: "front" }, outfit: { primary: "#F25C7A", secondary: "#FFF8EC" } },
  park_pony: { id: "park_pony", label: t("on a pony", "על פוני"), pose: "riding", accessory: { glyph: "🐴", place: "front" }, outfit: { primary: "#5BBF6B", secondary: "#FFFFFF" } },
  // ── ship ──
  ship_captain: { id: "ship_captain", label: t("in a captain's hat", "עם כובע קפטן"), pose: "saluting", accessory: { glyph: "🧢", place: "head" }, outfit: { primary: "#FFFFFF", secondary: "#1B6FA8" } },
  ship_telescope: { id: "ship_telescope", label: t("with a telescope", "עם טלסקופ"), pose: "holding", accessory: { glyph: "🔭", place: "hand" }, outfit: { primary: "#F25C7A", secondary: "#FFFFFF" } },
  ship_lifebuoy: { id: "ship_lifebuoy", label: t("with a life ring", "עם גלגל הצלה"), pose: "standing", accessory: { glyph: "🛟", place: "body" }, outfit: { primary: "#FFB61E", secondary: "#1B6FA8" } },
  // ── volcano ──
  volcano_helmet: { id: "volcano_helmet", label: t("in an explorer's helmet", "עם קסדת חוקר"), pose: "standing", accessory: { glyph: "⛑️", place: "head" }, outfit: { primary: "#C9A227", secondary: "#2B2A33" } },
  volcano_egg: { id: "volcano_egg", label: t("next to a dinosaur egg", "ליד ביצת דינוזאור"), pose: "sitting", accessory: { glyph: "🥚", place: "front" }, outfit: { primary: "#5BBF6B", secondary: "#FFB61E" } },
  volcano_balloon: { id: "volcano_balloon", label: t("in a hot-air balloon", "בכדור פורח"), pose: "waving", accessory: { glyph: "🎈", place: "head" }, outfit: { primary: "#F25C7A", secondary: "#2FA4D6" } },
};

export function bodyTemplate(id: string): BodyTemplate {
  const t = BODY_TEMPLATES[id];
  if (!t) throw new Error(`Unknown body template "${id}"`);
  return t;
}

/** Sprite box ratio used by the procedural renderer (width / height). */
export const COMPOSED_SPRITE_ASPECT = 100 / 140;
