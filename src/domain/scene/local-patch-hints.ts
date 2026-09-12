import type { LocalizedText } from "./schema";

/** Authored against the actual crop positions, not the legacy target names.
 * Neighbourhoods are deliberately stable landmarks: a painter may replace a
 * nearby person completely, so hints never depend on that person's clothes. */
export const LOCAL_PATCH_HINTS: Readonly<Record<string, LocalizedText>> = Object.freeze({
  "sydney-1": { en: "Look on the sand below the large sandcastle.", he: "חפשו על החול מתחת לטירת החול הגדולה." },
  "sydney-2": { en: "Look where the sand meets the shallow rock pools.", he: "חפשו במקום שבו החול פוגש את בריכות הסלע הרדודות." },
  "sydney-3": { en: "Look among the shallow rock pools on the right.", he: "חפשו בין בריכות הסלע הרדודות בצד ימין." },
  "antarctica-1": { en: "Look on the snow between the tent and the seals.", he: "חפשו בשלג שבין האוהל לכלבי הים." },
  "antarctica-2": { en: "Look beside the penguin line near the bottom of the picture.", he: "חפשו ליד שורת הפינגווינים בחלק התחתון של התמונה." },
  "antarctica-3": { en: "Look on the snowy slope below the sliding penguin.", he: "חפשו במדרון המושלג מתחת לפינגווין המחליק." },
  "giza-1": { en: "Look among the carved stone blocks at the lower right.", he: "חפשו בין גושי האבן החרוטים בצד ימין למטה." },
  "giza-2": { en: "Look beside the pottery under the colourful market cloths.", he: "חפשו ליד כלי החרס שמתחת לבדים הצבעוניים של הדוכן." },
  "giza-3": { en: "Look beside the resting camels in the lower middle.", he: "חפשו ליד הגמלים הנחים בחלק האמצעי התחתון." },
  "tokyo-1": { en: "Look on the wet crossing, beyond the lower-left market stall.", he: "חפשו במעבר החציה הרטוב, מעבר לדוכן שבצד שמאל למטה." },
  "tokyo-2": { en: "Look near the pink flower bouquets at the lower right.", he: "חפשו ליד זרי הפרחים הוורודים בצד ימין למטה." },
  "tokyo-3": { en: "Look on the wet road behind the stroller near the bottom.", he: "חפשו בכביש הרטוב מאחורי העגלה שבחלק התחתון." },
  "amazon-1": { en: "Look among the thick tree roots at the lower left.", he: "חפשו בין שורשי העץ העבים בצד שמאל למטה." },
  "amazon-2": { en: "Look beside the giant round leaves in the lower-left water.", he: "חפשו ליד העלים העגולים הענקיים שבמים בצד שמאל למטה." },
  "amazon-3": { en: "Look along the leafy bank below the wooden dock on the right.", he: "חפשו בגדה הירוקה שמתחת לרציף העץ בצד ימין." },
  "greatwall-1": { en: "Look along the stone walkway below the dragon, near the baskets.", he: "חפשו בשביל האבן שמתחת לדרקון, ליד הסלים." },
  "greatwall-2": { en: "Look along the right-hand edge of the stone walkway.", he: "חפשו לאורך הקצה הימני של שביל האבן." },
  "greatwall-3": { en: "Look beside the left wall, below the dragon's head.", he: "חפשו ליד החומה השמאלית, מתחת לראש הדרקון." },
  "marrakech-1": { en: "Look among the decorated pottery at the lower right.", he: "חפשו בין כלי החרס המקושטים בצד ימין למטה." },
  "marrakech-4": { en: "Look in the passage between the fruit cart and the tea stall.", he: "חפשו במעבר שבין עגלת הפירות לדוכן התה." },
  "marrakech-5": { en: "Look near the tea table and pots at the lower left.", he: "חפשו ליד שולחן התה והקומקומים בצד שמאל למטה." },
  "newyork-1": { en: "Look by the yellow taxi at the lower left.", he: "חפשו ליד המונית הצהובה בצד שמאל למטה." },
  "newyork-3": { en: "Look left of the pretzel cart with the blue-and-yellow umbrella.", he: "חפשו משמאל לעגלת הבייגלה עם השמשייה הכחולה והצהובה." },
  "newyork-4": { en: "Look beside the violin player in the lower part of the street.", he: "חפשו ליד נגן הכינור בחלק התחתון של הרחוב." },
  "paris-3": { en: "Look between the easels in the lower middle of the square.", he: "חפשו בין כני הציור בחלק האמצעי התחתון של הכיכר." },
  "paris-4": { en: "Look on the paving beside the café tables at the lower left.", he: "חפשו על המרצפות ליד שולחנות בית הקפה בצד שמאל למטה." },
  "paris-5": { en: "Look beside the seated painter and the picture of the Eiffel Tower.", he: "חפשו ליד הצייר היושב והתמונה של מגדל אייפל." },
});

export function localPatchHint(hideId: string): LocalizedText {
  const hint = LOCAL_PATCH_HINTS[hideId];
  if (!hint) throw new Error(`LOCAL_PATCH: no authored hint for ${hideId}`);
  return hint;
}
