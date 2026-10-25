import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ user: {id:"owner"} as {id:string}|null, read:vi.fn(), intent:vi.fn(), asset:vi.fn(), get:vi.fn(), attach:vi.fn() }));
vi.mock("@/lib/server/qa-access",()=>({qaAccessDenied:async()=>null}));
vi.mock("@/lib/purchasing",()=>({purchasingEnabled:()=>true}));
vi.mock("@/services/container",()=>({getContainer:()=>({db:{game:{findUnique:f.read},childWorldPurchase:{findFirst:f.intent},asset:{findUnique:f.asset}},storage:{get:f.get}})}));
vi.mock("@/services/create-flow.service",async()=>({attachPhoto:f.attach,...await import("@/domain/game/access")}));
vi.mock("@/lib/server/session",()=>({currentUser:async()=>f.user,draftTokenFromCookie:async()=>"other-tab-cookie"}));
vi.mock("@/lib/server/rate-limit",()=>({LIMITS:{photoUpload:{limit:12,windowMs:600000}},callerKey:()=>"synthetic",rateLimit:()=>({ok:true})}));
import {GET,POST} from "./route";
beforeEach(()=>{
 vi.clearAllMocks();f.user={id:"owner"};
 f.read.mockResolvedValue({id:"first-game",ownerId:"owner",draftToken:"first-token",deletedAt:null,childProfile:{originalPhotoAssetId:"first-photo",deletedAt:null}});
 f.intent.mockResolvedValue(null);
 f.asset.mockResolvedValue({ownerId:"owner",type:"ORIGINAL_PHOTO",visibility:"PRIVATE",status:"READY",deletedAt:null,storagePath:"private/synthetic-first",mimeType:"image/png"});
 f.get.mockResolvedValue(Buffer.from("synthetic-photo"));
});
it("serves the first tab's owned photo after another creation changed the cookie, without reading its sibling",async()=>{
 const result=await GET(new Request("https://qa.example.invalid/api/drafts/photo?draft=first-game"));
 expect(result.status).toBe(200);expect(await result.text()).toBe("synthetic-photo");
 expect(f.read).toHaveBeenCalledOnce();expect(f.read.mock.calls[0]![0].where).toEqual({id:"first-game"});
 expect(result.headers.get("Cache-Control")).toBe("private, no-store");expect(f.intent).not.toHaveBeenCalled();
});
it.each(["foreign","signed-out","missing","deleted","foreign-photo"])("never returns private bytes for an invalid explicit creation selector: %s",async kind=>{
 if(kind==="foreign")f.user={id:"other-owner"};
 if(kind==="signed-out")f.user=null;
 if(kind==="missing")f.read.mockResolvedValue(null);
 if(kind==="deleted")f.read.mockResolvedValue({id:"first-game",ownerId:"owner",draftToken:"first-token",deletedAt:new Date(),childProfile:{originalPhotoAssetId:"first-photo"}});
 if(kind==="foreign-photo")f.asset.mockResolvedValue({ownerId:"other-owner",type:"ORIGINAL_PHOTO",visibility:"PRIVATE",status:"READY",deletedAt:null});
 const result=await GET(new Request("https://qa.example.invalid/api/drafts/photo?draft=first-game"));
 expect(result.status).toBe(404);expect(f.get).not.toHaveBeenCalled();expect(f.read).toHaveBeenCalledOnce();
});
it.each([GET,POST])("rejects conflicting selectors before any lookup",async handler=>{
 const result=await handler(new Request("https://qa.example.invalid/api/drafts/photo?draft=first-game&game=second-game"));
 expect(result.status).toBe(404);expect(f.read).not.toHaveBeenCalled();expect(f.attach).not.toHaveBeenCalled();
});
it("binds an upload to the first owned draft and retains the existing consent and file gates",async()=>{
 const form=new FormData();form.set("consent","1");
 const result=await POST(new Request("https://qa.example.invalid/api/drafts/photo?draft=first-game",{method:"POST",body:form}));
 expect(result.status).toBe(400);expect(await result.json()).toMatchObject({code:"NO_FILE"});
 expect(f.read.mock.calls[0]![0].where).toEqual({id:"first-game"});expect(f.attach).not.toHaveBeenCalled();
});
it("retains the stricter purchase-intent requirement on the existing family-world selector",async()=>{
 const result=await GET(new Request("https://qa.example.invalid/api/drafts/photo?game=first-game"));
 expect(result.status).toBe(404);expect(f.get).not.toHaveBeenCalled();expect(f.intent).toHaveBeenCalledOnce();
});
