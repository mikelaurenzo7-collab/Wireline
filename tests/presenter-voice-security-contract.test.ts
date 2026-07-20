import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Presenter (HeyGen) voice authorization boundary.
 *
 * The ElevenLabs removal deleted tests/verified-voice-security-contract.test.ts
 * wholesale, but two of that file's three blocks were ElevenLabs/voices-routes
 * specific. Its middle block guarded the *presenter* path, which is still live
 * (video presenter kept). This restores that boundary so a future refactor
 * cannot silently let a tenant synthesize with a private/unauthorized voice.
 */
describe("presenter voice security contract", () => {
  const heygen = read("src/lib/video-presenter/heygen-voice-service.ts");

  it("lists presenter voices from the public HeyGen catalog only", () => {
    // Discovery must scope to the public catalog, never a private/all listing.
    expect(heygen).toContain('type: "public"');
    expect(heygen).toContain("/v3/voices?");
  });

  it("resolves a voice only via public-catalog membership, else 404", () => {
    // getPresenterVoice must resolve through listPresenterVoices() rather than
    // fetching an arbitrary voice by id, and 404 when the id is not public.
    expect(heygen).toContain("(await listPresenterVoices()).find(");
    expect(heygen).toContain('throw AppError.fromHttpStatus(404, "Presenter voice not found.")');
  });

  it("enforces the public-catalog boundary before any paid synthesis", () => {
    // generatePresenterSpeech must run the boundary check (getPresenterVoice)
    // before hitting the paid /v3/voices/speech endpoint.
    expect(heygen).toContain("Enforce the same public-catalog boundary before paid synthesis");
    expect(heygen).toContain("await getPresenterVoice(voiceId)");
    expect(heygen).toContain('heygenFetch<HeyGenSpeechResponse>("/v3/voices/speech"');
  });

  it("never fetches a presenter voice by arbitrary id from a private endpoint", () => {
    // A per-id GET (/v3/voices/${voiceId}) would bypass public-catalog membership
    // and let a tenant synthesize with a private/unauthorized voice.
    expect(heygen).not.toMatch(/\/v3\/voices\/\$\{[^}]*(voiceId|normalized|id)[^}]*\}/);
  });
});
