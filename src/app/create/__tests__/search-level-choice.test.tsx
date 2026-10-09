// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, waitFor, within, type RenderResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import { SearchLevelChoice } from "../SearchLevelChoice";
import { NameForm } from "../NameForm";

const action = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("../actions", () => ({ saveNameAction: action }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function Controlled({ age = null as number | null, initial = null as "explorers" | "detectives" | null }) {
  const [value, setValue] = React.useState(initial);
  return <SearchLevelChoice value={value} onChange={setValue} ageYears={age} />;
}

describe("the two cards", () => {
  it("are one named group of two radios, with nothing chosen for the parent", () => {
    const view = render(<I18nProvider locale="en" dict={en}><Controlled /></I18nProvider>);
    const group = view.getByRole("group", { name: en.create.level.title });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios.map(radio => radio.checked)).toEqual([false, false]);
    expect(within(group).getByRole("radio", { name: /Explorers Ages 3–5 A gentle first search/ })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: /Detectives Ages 6\+ More details, more challenge/ })).toBeTruthy();
  });

  it("the whole card chooses, and the choice is not shown by colour alone", () => {
    const view = render(<I18nProvider locale="en" dict={en}><Controlled /></I18nProvider>);
    const detectives = view.getByRole("radio", { name: /Detectives/ }) as HTMLInputElement;
    const card = detectives.closest("label")!;
    fireEvent.click(card.querySelector(".level-card__line")!);
    expect(detectives.checked).toBe(true);
    expect(card.classList.contains("fm-card--selected")).toBe(true);
    expect(card.querySelector(".level-card__check")).toBeTruthy();
    expect((view.getByRole("radio", { name: /Explorers/ }) as HTMLInputElement).checked).toBe(false);
  });

  it.each([[4, "Explorers"], [5, "Explorers"], [6, "Detectives"], [8, "Detectives"]])("age %i suggests %s with a badge, without choosing it", (age, name) => {
    const view = render(<I18nProvider locale="en" dict={en}><Controlled age={age} /></I18nProvider>);
    const suggested = view.getByRole("radio", { name: new RegExp(`^${name}.*Suits age ${age}$`) }) as HTMLInputElement;
    expect(suggested.checked).toBe(false);
    expect(view.getAllByText(/Suits age/)).toHaveLength(1);
  });

  it("keeps a choice already made when the age suggests the other card", () => {
    const view = render(<I18nProvider locale="he" dict={he}><Controlled age={9} initial="explorers" /></I18nProvider>);
    expect((view.getByRole("radio", { name: /מגלים/ }) as HTMLInputElement).checked).toBe(true);
    expect(view.getByRole("radio", { name: /בלשים.*מומלץ לגיל 9/ })).toBeTruthy();
  });

  it("writes Hebrew age ranges with an ASCII hyphen so they read in order right to left", () => {
    expect(he.create.level.explorers.ages).toBe("גילאי 3-5");
    for (const value of Object.values(he.create.level).flatMap(v => typeof v === "string" ? [v] : Object.values(v))) expect(value).not.toMatch(/\d–\d/);
  });
});

describe("the name step", () => {
  const props = { initialName: "", initialAge: null };
  it("is unchanged while the cards are not asked", () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...props} /></I18nProvider>);
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    expect(view.container.querySelector(".create__child-fields--level")).toBeNull();
  });

  it("reads name, path, then exact age, and answers a missing path on the spot", () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...props} levelChoice /></I18nProvider>);
    const name = view.getByLabelText(en.create.name.label), group = view.getByRole("group", { name: en.create.level.title }), age = view.getByLabelText(en.create.name.ageLabel);
    expect(name.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(age) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(name, { target: { value: "Synthetic" } });
    fireEvent.change(age, { target: { value: "8" } });
    fireEvent.submit(name.closest("form")!);
    expect(view.getByRole("alert").textContent).toBe(en.errors.SEARCH_LEVEL_REQUIRED);
    expect(action).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(view.getAllByRole("radio")[0]);
    fireEvent.click(view.getByRole("radio", { name: /Explorers/ }));
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("restores a saved path", () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...props} levelChoice initialLevel="detectives" /></I18nProvider>);
    expect((view.getByRole("radio", { name: /Detectives/ }) as HTMLInputElement).checked).toBe(true);
  });
});

// Choosing another child than the continued draft's starts a new draft on save, which
// follows a new draft's terms. The form shows those terms, never the old draft's.
describe("changing the child of a saved draft", () => {
  const family = [{ id: "old-child", displayName: "Synthetic old" }, { id: "new-child", displayName: "Synthetic new" }];
  /** The first child's draft, saved before the cards; a new draft would be asked. */
  const legacy = { initialName: "Synthetic old", initialAge: 8, children: family, initialChildId: "old-child",
    draftChild: { familyChildId: "old-child" }, levelChoice: false, freshLevelChoice: true, initialLevel: null };
  const choose = (view: RenderResult, id: string) => fireEvent.change(view.container.querySelector('select[name="familyChildId"]')!, { target: { value: id } });
  const age = (view: RenderResult, years: string) => fireEvent.change(view.getByLabelText(en.create.name.ageLabel), { target: { value: years } });
  const submit = (view: RenderResult) => fireEvent.click(view.container.querySelector('.create__actions button[type="submit"]')!);
  const sent = async () => {
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    return { familyChildId: data.get("familyChildId"), name: data.get("name"), searchLevel: data.get("searchLevel"), ageYears: data.get("ageYears") };
  };

  it.each([["another saved child", "new-child"], ["a new child", ""]])("asks for %s's new adventure, with nothing chosen, and sends the answer", async (_label, id) => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...legacy} /></I18nProvider>);
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    choose(view, id);
    expect((view.getAllByRole("radio") as HTMLInputElement[]).map(radio => radio.checked)).toEqual([false, false]);
    if (!id) fireEvent.change(view.getByLabelText(en.create.name.label), { target: { value: "Synthetic third" } });
    age(view, "8");
    submit(view);
    expect(view.getByRole("alert").textContent).toBe(en.errors.SEARCH_LEVEL_REQUIRED);
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("radio", { name: /Explorers/ }));
    submit(view);
    expect(await sent()).toEqual({ familyChildId: id, name: id ? "Synthetic new" : "Synthetic third", searchLevel: "explorers", ageYears: "8" });
  });

  it("returning to the draft's own child puts its terms back: no cards, the legacy meaning", async () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...legacy} /></I18nProvider>);
    choose(view, "new-child");
    fireEvent.click(view.getByRole("radio", { name: /Detectives/ }));
    choose(view, "old-child");
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    age(view, "8");
    submit(view);
    expect(await sent()).toEqual({ familyChildId: "old-child", name: "Synthetic old", searchLevel: null, ageYears: "8" });
  });

  it("never carries a saved path to another child, and restores it with its own child", () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...legacy} levelChoice initialLevel="detectives" /></I18nProvider>);
    const checked = () => (view.getAllByRole("radio") as HTMLInputElement[]).map(radio => radio.checked);
    expect(checked()).toEqual([false, true]);
    choose(view, "new-child");
    expect(checked()).toEqual([false, false]);
    choose(view, "old-child");
    expect(checked()).toEqual([false, true]);
  });

  it("follows the server when the choice is off: no cards for another child, and nothing holds the form back", async () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...legacy} freshLevelChoice={false} /></I18nProvider>);
    choose(view, "new-child");
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    age(view, "6");
    submit(view);
    expect(await sent()).toEqual({ familyChildId: "new-child", name: "Synthetic new", searchLevel: null, ageYears: "6" });
  });

  it("keeps a new child's typed name across switches", () => {
    const view = render(<I18nProvider locale="en" dict={en}><NameForm {...legacy} /></I18nProvider>);
    const name = () => (view.getByLabelText(en.create.name.label) as HTMLInputElement).value;
    choose(view, "");
    fireEvent.change(view.getByLabelText(en.create.name.label), { target: { value: "Synthetic third" } });
    choose(view, "new-child");
    expect(name()).toBe("Synthetic new");
    choose(view, "");
    expect(name()).toBe("Synthetic third");
    expect(view.getAllByRole("radio")).toHaveLength(2);
  });
});
