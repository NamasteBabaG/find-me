import { describe, expect, it } from "vitest";
import { legalDocuments } from "@/domain/legal";
import { friendsEn, friendsHe } from "@/i18n/dictionaries/world-features";
import { GUEST_RESULT_RETENTION_MS, GUEST_SHARE_LIFETIME_MS } from "../guest-sharing.service";

describe("public friend-sharing retention matches the implemented lifecycle", () => {
  it.each(["en", "he"] as const)("keeps %s privacy and consent notices consistent with the server's invitation and result periods", locale => {
    const notice = legalDocuments[locale].privacy.sections.find(section => section.title === (locale === "en" ? "Invitations for friends to play" : "הזמנות למשחק עם חברים"));
    expect(notice).toBeDefined();
    const days = (notice!.paragraphs.join(" ").match(/\d+/g) ?? []).map(Number);
    const owner = (locale === "en" ? friendsEn : friendsHe).owner;
    expect(days).toEqual([GUEST_SHARE_LIFETIME_MS / 86400_000, GUEST_RESULT_RETENTION_MS / 86400_000]);
    expect((owner.lifetime.match(/\d+/g) ?? []).map(Number)).toEqual(days);
    expect(owner.consent).toContain(locale === "en" ? "displayed name" : "שם הילד שמוצג");
    expect(owner.scope).toContain(locale === "en" ? "name shown in this game" : "שם הילד שמוצג במשחק");
  });
});
