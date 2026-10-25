import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({user:vi.fn(),close:vi.fn(),intent:vi.fn(),game:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:(href:string)=>{throw Error("REDIRECT:"+href);}}));
vi.mock("@/lib/server/qa-access",()=>({requireQaAccess:async()=>{}}));
vi.mock("@/lib/server/session",()=>({currentUser:f.user}));
vi.mock("@/lib/server/db-guard",()=>({guardDb:(fn:()=>unknown)=>fn()}));
vi.mock("@/lib/server/rate-limit",()=>({LIMITS:{checkout:{limit:10,windowMs:600000}},rateLimit:()=>({ok:true})}));
vi.mock("@/services/container",()=>({getContainer:()=>({db:{childWorldPurchase:{findFirst:f.intent},game:{findFirst:f.game}}})}));
vi.mock("@/services/checkout-close.service",()=>({closeDraftCheckout:f.close}));
import {closePaymentAction} from "./actions";
const form=()=>{const data=new FormData();data.set("gameId","first-game");data.set("orderId","first-order");return data;};
beforeEach(()=>{vi.clearAllMocks();f.user.mockResolvedValue({id:"owner"});f.close.mockResolvedValue({ok:true});f.intent.mockResolvedValue(null);});
it("returns the owner to the closed ordinary draft even after another tab changed the cookie",async()=>{
 await expect(closePaymentAction(null,form())).rejects.toThrow("REDIRECT:/checkout?draft=first-game&cancelled=1");
 expect(f.close).toHaveBeenCalledWith(expect.anything(),{ownerId:"owner",gameId:"first-game",orderId:"first-order"});
});
it("retains the existing family-world continuation selector when the active intent exists",async()=>{
 f.intent.mockResolvedValue({activeGameId:"first-game",ownerId:"owner"});
 await expect(closePaymentAction(null,form())).rejects.toThrow("REDIRECT:/checkout?game=first-game&cancelled=1");
});
it("an expired login returns to this payment's recovery page before any close action",async()=>{
 f.user.mockResolvedValue(null);
 await expect(closePaymentAction(null,form())).rejects.toThrow("REDIRECT:/family?next=%2Fcheckout%2Fclose%3Fgame%3Dfirst-game");
 expect(f.close).not.toHaveBeenCalled();expect(f.intent).not.toHaveBeenCalled();
});
it("a refused or raced financial close stays refused and never redirects to another draft",async()=>{
 f.close.mockResolvedValue({ok:false,code:"DRAFT_LOCKED",reason:"Synthetic refusal"});
 expect(await closePaymentAction(null,form())).toMatchObject({ok:false,code:"DRAFT_LOCKED"});expect(f.intent).not.toHaveBeenCalled();
});
