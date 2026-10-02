import { describe, expect, it } from "vitest";
import { adminAlertEmail, gameReadyEmail, magicLinkEmail } from "../templates";
import { escapeHtml } from "../html";
import { normalizeChildName } from "@/lib/copy";

describe("transactional email HTML boundaries", () => {
  it.each(["en", "he"] as const)("renders a valid short markup name as text in %s, including title and preheader", locale => {
    const childName = normalizeChildName("<img src=//x.invalid>"), playLink = "https://example.invalid/play?x=1&y=2";
    const mail = gameReadyEmail({ to: "parent@example.invalid", childName, playLink, sceneCount: 9, locale, playMode: "find-any" });
    expect(mail.html).not.toContain(childName);
    expect(mail.html).toContain(escapeHtml(childName));
    expect(mail.html.match(/&lt;img src=\/\/x.invalid&gt;/g)!.length).toBeGreaterThanOrEqual(3);
    expect(mail.subject).toContain(childName);
    expect(mail.text).toContain(childName);
    expect(mail.html).toContain('href="https://example.invalid/play?x=1&amp;y=2"');
  });
  it("escapes quotes and ampersands in link attributes without changing the plain text link", () => {
    const link = 'https://example.invalid/?x=" onclick="synthetic&y=2';
    const mail = magicLinkEmail({ to: "parent@example.invalid", link, locale: "en" });
    expect(mail.html).toContain(`href="${escapeHtml(link)}"`);
    expect(mail.html).not.toContain(' onclick="synthetic');
    expect(mail.text).toContain(link);
    const ready = gameReadyEmail({ to: "parent@example.invalid", childName: "Synthetic", playLink: link, libraryLink: link, sceneCount: 9, locale: "he" });
    expect(ready.html.match(/&quot; onclick=&quot;/g)).toHaveLength(2);
  });
  it("escapes admin titles as well as failure details and supports the operational stalled alert", () => {
    const childName = "<b>Fixture</b>", issue = '<a href="//invalid">test</a>';
    const mail = adminAlertEmail({ kind: "generation-stalled", gameId: "synthetic", childName, ownerEmail: null, status: "PAID", sceneCount: 9, problems: [issue], failedSpots: [], costCents: null, adminUrl: 'https://example.invalid/?x="&y=2' });
    expect(mail.html).not.toContain(childName);
    expect(mail.html).not.toContain(issue);
    expect(mail.html).toContain(escapeHtml(childName));
    expect(mail.html).toContain(escapeHtml(issue));
    expect(mail.subject).toContain(childName);
    expect(mail.text).toContain(issue);
  });
});
