// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guidedFixture } from "../../../domain/adventure/__tests__/guided-fixture";
import { GameI18nProvider } from "../../i18n";
import { DiscoveryTray } from "../DiscoveryTray";

beforeEach(()=>vi.stubGlobal("React",React));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows all six targets, lets a child focus one, and never itself collects or changes the child mission",()=>{
  const {config}=guidedFixture(), onSelect=vi.fn(), onHint=vi.fn();
  const props={board:config.adventure!.boards[0]!,scene:config.scenes[0]!,collectedIds:["item-1"],selectedId:null,hintLevel:0 as const,disabled:false,muted:false,onSelect,onHint};
  const view=render(<GameI18nProvider locale="en"><DiscoveryTray {...props}/></GameI18nProvider>);
  const toggle=screen.getByRole("button",{name:/Discoveries 1\/6/}); fireEvent.click(toggle);
  expect(screen.getByRole("button",{name:"Item 1 — Collected"}).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Item 4"}));
  expect(onSelect).toHaveBeenCalledWith("item-4"); expect(screen.queryByRole("region")).toBeNull();
  view.rerender(<GameI18nProvider locale="en"><DiscoveryTray {...props} selectedId="item-4"/></GameI18nProvider>);
  fireEvent.click(screen.getByRole("button",{name:"Item hint"})); expect(onHint).toHaveBeenCalledOnce();
  view.rerender(<GameI18nProvider locale="en"><DiscoveryTray {...props} selectedId="item-4" collectedIds={["item-1","item-4"]}/></GameI18nProvider>);
  expect(screen.queryByRole("button",{name:"Item hint"})).toBeNull();
});
it("supports Escape, restores focus, and disables controls during the child swap",()=>{
  const {config}=guidedFixture();
  const props={board:config.adventure!.boards[0]!,scene:config.scenes[0]!,collectedIds:[],selectedId:null,hintLevel:0 as const,disabled:false,muted:true,onSelect:vi.fn(),onHint:vi.fn()};
  const view=render(<GameI18nProvider locale="he"><DiscoveryTray {...props}/></GameI18nProvider>);
  const toggle=screen.getByRole("button",{name:/תגליות 0\/6/}); fireEvent.click(toggle);
  fireEvent.keyDown(screen.getByRole("region"),{key:"Escape"}); expect(document.activeElement).toBe(toggle);
  fireEvent.click(toggle); view.rerender(<GameI18nProvider locale="he"><DiscoveryTray {...props} disabled/></GameI18nProvider>);
  expect(screen.queryByRole("region")).toBeNull(); expect(toggle.hasAttribute("disabled")).toBe(true);
});
