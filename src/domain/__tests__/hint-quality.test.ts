import { describe, expect, it } from "vitest";
import { hintProblem } from "../scene/schema";

/**
 * The hint is the one sentence that helps a child who is stuck. Two whole
 * worlds shipped with the authoring placeholder in every spot, and the
 * validator waved them through — so this is the rule that stops it.
 */
const mission = { en: "Find {name} hiding inside a barrel", he: "מצאו את {name} מתחבא/ת בתוך חבית" };
const item = { en: "stacked wooden barrels beside the tents", he: "חביות עץ ערומות ליד האוהלים" };

describe("hint quality", () => {
  it("refuses the authoring placeholder in either language", () => {
    expect(hintProblem({ en: "Look near the barrel.", he: "חפשו ליד המקום הזה." }, mission, item)).toMatch(/placeholder/);
    expect(hintProblem({ en: "Under the orange tent on the right, by the stacked barrels.", he: "חפשו ליד המקום הזה." }, mission, item)).toMatch(/placeholder/);
    expect(hintProblem({ en: "Look near the chest", he: "מתחת לאוהל הכתום מימין." }, mission, item)).toMatch(/placeholder/);
    // "Look near the flower seller at the bottom left." is a real hint, not the scaffold.
    expect(hintProblem({ en: "Look near the flower seller at the bottom left.", he: "ליד מוכרת הפרחים למטה משמאל." }, mission, item)).toBeNull();
  });

  it("refuses a hint that only repeats the mission or the item", () => {
    expect(hintProblem({ en: "Find hiding inside a barrel", he: "מצאו את מתחבא/ת בתוך חבית" }, mission, item)).toMatch(/mission/);
    expect(hintProblem(item, mission, item)).toMatch(/item/);
  });

  it("refuses a hint too short to narrow anything", () => {
    expect(hintProblem({ en: "Barrel.", he: "חבית." }, mission, item)).toMatch(/short/);
  });

  it("accepts a spatial hint that says where to look", () => {
    expect(hintProblem({ en: "Under the orange tent on the right, by the stacked barrels.", he: "מתחת לאוהל הכתום מימין, ליד החביות הערומות." }, mission, item)).toBeNull();
  });
});
