import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll,afterAll,beforeEach,expect,it,vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
const f=vi.hoisted(()=>({admin:true,locale:"he",plan:vi.fn(),grant:vi.fn()}));
vi.mock("@/lib/server/session",()=>({currentAdmin:async()=>f.admin?{id:"synthetic-admin"}:null}));
vi.mock("@/services/container",()=>({getContainer:()=>({synthetic:true})}));
vi.mock("@/i18n/server",()=>({getI18n:async()=>({t:f.locale==="he"?he:en})}));
vi.mock("@/services/generation/qa-completion-capacity",()=>({planQaCompletionCapacity:f.plan}));
vi.mock("../../actions",()=>({authorizeQaCompletionCapacityAction:f.grant}));
import { QaCompletionCapacityForm } from "./QaCompletionCapacityForm";
beforeAll(()=>vi.stubGlobal("React",React));afterAll(()=>vi.unstubAllGlobals());
beforeEach(()=>{f.admin=true;f.locale="he";f.grant.mockReset();f.plan.mockReset().mockResolvedValue({binding:{state:{ownerId:"synthetic-admin"},committedMicroUsd:3900000,reservedMicroUsd:1000000},planSha256:"a".repeat(64)});});
it.each(["he","en"])("shows the exact %s cumulative grant and makes no write on page load",async locale=>{
  f.locale=locale;const html=renderToStaticMarkup(await QaCompletionCapacityForm({gameId:"synthetic-world"})),p=locale==="he"?he.adminQaCompletion:en.adminQaCompletion;
  expect(html).toContain(p.title);expect(html).toContain(p.confirm);expect(html).toContain("3.90");expect(html).toContain("1.00");expect(html).toContain("12.00");
  expect(html).toContain('name="ownerAuthorizationSha256"');expect(html).toContain('type="checkbox"');expect(html).toContain('required=""');expect(html).not.toContain("snapshotJson");expect(f.grant).not.toHaveBeenCalled();
});
it("hides the grant from another owner, a nonadministrator or an ineligible world",async()=>{
  f.admin=false;expect(await QaCompletionCapacityForm({gameId:"synthetic-world"})).toBeNull();expect(f.plan).not.toHaveBeenCalled();
  f.admin=true;f.plan.mockResolvedValue({binding:{state:{ownerId:"another-owner"}}});expect(await QaCompletionCapacityForm({gameId:"synthetic-world"})).toBeNull();
  f.plan.mockRejectedValue(Error("synthetic hold"));expect(await QaCompletionCapacityForm({gameId:"synthetic-world"})).toBeNull();expect(f.grant).not.toHaveBeenCalled();
});
