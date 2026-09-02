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
export type BodyPose = "standing" | "sitting" | "peeking" | "holding" | "floating" | "waving" | "riding" | "saluting";

export interface BodyTemplate {
  id: string;
  label: string;
  pose: BodyPose;
  /** Emoji/glyph stand-in for the accessory until illustrated bodies exist. */
  accessory: { glyph: string; place: "hand" | "head" | "body" | "front" | "none" };
  outfit: { primary: string; secondary: string };
  /** Optional illustrated body (future). Face anchor in template units (0..1). */
  art?: { src: string; width: number; height: number; face: { x: number; y: number; r: number } };
}

export const BODY_TEMPLATES: Record<string, BodyTemplate> = {
  // ── beach ──
  beach_float: { id: "beach_float", label: "עם גלגל ים", pose: "standing", accessory: { glyph: "🛟", place: "body" }, outfit: { primary: "#FFB61E", secondary: "#F25C7A" } },
  beach_sandcastle: { id: "beach_sandcastle", label: "בונה ארמון חול", pose: "sitting", accessory: { glyph: "🏰", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#FFF8EC" } },
  beach_umbrella_peek: { id: "beach_umbrella_peek", label: "מציץ/ה מאחורי שמשייה", pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#5BBF6B", secondary: "#FFB61E" } },
  // ── jungle ──
  jungle_binoculars: { id: "jungle_binoculars", label: "עם משקפת", pose: "holding", accessory: { glyph: "🔭", place: "hand" }, outfit: { primary: "#C9A227", secondary: "#5BBF6B" } },
  jungle_boat: { id: "jungle_boat", label: "בסירה קטנה", pose: "riding", accessory: { glyph: "🛶", place: "front" }, outfit: { primary: "#F25C7A", secondary: "#FFF8EC" } },
  jungle_leaf_peek: { id: "jungle_leaf_peek", label: "מאחורי עלה ענק", pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#FFB61E", secondary: "#2FA4D6" } },
  // ── space ──
  space_astronaut: { id: "space_astronaut", label: "בחליפת אסטרונאוט", pose: "floating", accessory: { glyph: "🪐", place: "hand" }, outfit: { primary: "#FFFFFF", secondary: "#8C6BD9" } },
  space_rover: { id: "space_rover", label: "ברכב ירח", pose: "riding", accessory: { glyph: "🚙", place: "front" }, outfit: { primary: "#2FA4D6", secondary: "#FFFFFF" } },
  space_aliens: { id: "space_aliens", label: "ליד חייזרים", pose: "waving", accessory: { glyph: "👽", place: "hand" }, outfit: { primary: "#5BBF6B", secondary: "#FFB61E" } },
  // ── stadium ──
  stadium_scarf: { id: "stadium_scarf", label: "עם צעיף", pose: "standing", accessory: { glyph: "🧣", place: "body" }, outfit: { primary: "#F25C7A", secondary: "#FFFFFF" } },
  stadium_ball: { id: "stadium_ball", label: "מחזיק/ה כדור", pose: "holding", accessory: { glyph: "⚽", place: "hand" }, outfit: { primary: "#2FA4D6", secondary: "#FFFFFF" } },
  stadium_flag: { id: "stadium_flag", label: "מנופף/ת בדגל", pose: "waving", accessory: { glyph: "🚩", place: "hand" }, outfit: { primary: "#FFB61E", secondary: "#2B2A33" } },
  // ── city ──
  city_bus: { id: "city_bus", label: "ליד האוטובוס", pose: "standing", accessory: { glyph: "🎒", place: "body" }, outfit: { primary: "#F25C7A", secondary: "#FFB61E" } },
  city_scooter: { id: "city_scooter", label: "על קורקינט", pose: "riding", accessory: { glyph: "🛴", place: "front" }, outfit: { primary: "#5BBF6B", secondary: "#2B2A33" } },
  city_window: { id: "city_window", label: "מנופף/ת מחלון", pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#2FA4D6", secondary: "#FFFFFF" } },
  // ── market ──
  market_watermelon: { id: "market_watermelon", label: "עם אבטיח", pose: "holding", accessory: { glyph: "🍉", place: "hand" }, outfit: { primary: "#5BBF6B", secondary: "#F25C7A" } },
  market_flowers: { id: "market_flowers", label: "ליד הפרחים", pose: "standing", accessory: { glyph: "💐", place: "hand" }, outfit: { primary: "#FFB61E", secondary: "#8C6BD9" } },
  market_spices_peek: { id: "market_spices_peek", label: "מאחורי שקי תבלינים", pose: "peeking", accessory: { glyph: "", place: "none" }, outfit: { primary: "#C9A227", secondary: "#F25C7A" } },
  // ── park ──
  park_kite: { id: "park_kite", label: "מעיף/ה עפיפון", pose: "waving", accessory: { glyph: "🪁", place: "hand" }, outfit: { primary: "#2FA4D6", secondary: "#FFB61E" } },
  park_picnic: { id: "park_picnic", label: "ליד הפיקניק", pose: "sitting", accessory: { glyph: "🧺", place: "front" }, outfit: { primary: "#F25C7A", secondary: "#FFF8EC" } },
  park_pony: { id: "park_pony", label: "על פוני", pose: "riding", accessory: { glyph: "🐴", place: "front" }, outfit: { primary: "#5BBF6B", secondary: "#FFFFFF" } },
  // ── ship ──
  ship_captain: { id: "ship_captain", label: "עם כובע קפטן", pose: "saluting", accessory: { glyph: "🧢", place: "head" }, outfit: { primary: "#FFFFFF", secondary: "#1B6FA8" } },
  ship_telescope: { id: "ship_telescope", label: "עם טלסקופ", pose: "holding", accessory: { glyph: "🔭", place: "hand" }, outfit: { primary: "#F25C7A", secondary: "#FFFFFF" } },
  ship_lifebuoy: { id: "ship_lifebuoy", label: "עם גלגל הצלה", pose: "standing", accessory: { glyph: "🛟", place: "body" }, outfit: { primary: "#FFB61E", secondary: "#1B6FA8" } },
  // ── volcano ──
  volcano_helmet: { id: "volcano_helmet", label: "עם קסדת חוקר", pose: "standing", accessory: { glyph: "⛑️", place: "head" }, outfit: { primary: "#C9A227", secondary: "#2B2A33" } },
  volcano_egg: { id: "volcano_egg", label: "ליד ביצת דינוזאור", pose: "sitting", accessory: { glyph: "🥚", place: "front" }, outfit: { primary: "#5BBF6B", secondary: "#FFB61E" } },
  volcano_balloon: { id: "volcano_balloon", label: "בכדור פורח", pose: "waving", accessory: { glyph: "🎈", place: "head" }, outfit: { primary: "#F25C7A", secondary: "#2FA4D6" } },
};

export function bodyTemplate(id: string): BodyTemplate {
  const t = BODY_TEMPLATES[id];
  if (!t) throw new Error(`Unknown body template "${id}"`);
  return t;
}

/** Sprite box ratio used by the procedural renderer (width / height). */
export const COMPOSED_SPRITE_ASPECT = 100 / 140;
