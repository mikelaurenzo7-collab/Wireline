import { describe, expect, it } from "vitest";
import { emailTextHtml, renderBusinessEmail } from "../src/lib/email-presentation";

describe("business email presentation", () => {
  it("makes exact website and pricing URLs clickable without swallowing punctuation", () => {
    const body =
      "Website: https://botbound.app/. Plans: https://botbound.app/pricing?from=call&view=all.";
    const email = renderBusinessEmail({
      body,
      subject: "Your BotBound overview",
      identity: {
        businessName: "BotBound",
        botName: "Front Desk",
        website: "https://botbound.app/",
      },
    });
    expect(email.htmlBody).toContain('href="https://botbound.app/"');
    expect(email.htmlBody).toContain('href="https://botbound.app/pricing?from=call&amp;view=all"');
    expect(email.textBody).toBe(`${body}\n\nFront Desk\nBotBound\nhttps://botbound.app/`);
    expect(email.htmlBody).not.toContain("launch proof");
    expect(emailTextHtml("See (https://example.com/a_(b)).")).toContain(
      'href="https://example.com/a_(b)"',
    );
  });

  it("escapes model content and identity fields, rejecting executable or credentialed links", () => {
    const email = renderBusinessEmail({
      body: "<script>alert(1)</script> https://user:pass@example.com/ javascript:alert(1)",
      subject: "</title><script>alert(2)</script>",
      identity: {
        businessName: "<img src=x onerror=alert(3)>",
        logoUrl: "javascript:alert(4)",
        website: 'https://example.com/" onmouseover="x',
      },
    });
    expect(email.htmlBody).not.toContain("<script>");
    expect(email.htmlBody).not.toContain("<img");
    expect(email.htmlBody).not.toContain("href=");
    expect(email.htmlBody).toContain("&lt;script&gt;");
    expect(email.htmlBody).toContain("&lt;img src=x onerror=alert(3)&gt;");
  });

  it("uses each business's configured signature and never adds platform branding", () => {
    const identity = {
      businessName: "Oak & Elm",
      botName: "Reception",
      signature: "Warm regards,\nOak & Elm Guest Services",
      website: "https://oak.example/",
      mailboxEmail: "hello@oak.example",
    };
    const email = renderBusinessEmail({
      body: "Your appointment is confirmed.",
      subject: "Appointment",
      identity,
    });
    expect(email.textBody).toContain(
      "Warm regards,\nOak & Elm Guest Services\nhello@oak.example\nhttps://oak.example/",
    );
    expect(email.htmlBody).toContain("Oak &amp; Elm");
    expect(email.htmlBody).not.toContain("BotBound");
    expect(
      renderBusinessEmail({ body: email.textBody, subject: "Appointment", identity }).textBody,
    ).toBe(email.textBody);
  });

  it("uses a personal Bot's own identity without inventing a company", () => {
    const email = renderBusinessEmail({
      body: "Here is the information.",
      subject: "Information",
      identity: { botName: "Alex", mailboxEmail: "alex@example.com" },
    });
    expect(email.textBody).toBe("Here is the information.\n\nAlex\nalex@example.com");
    expect(email.htmlBody).not.toContain("BotBound");
    expect(email.htmlBody).toContain('lang="und" dir="auto"');
  });
});
