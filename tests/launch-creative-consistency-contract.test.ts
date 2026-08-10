import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const CAMPAIGN = "docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md";
const MEDIA_KIT = "docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md";
const PLAYBOOK = "docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md";

/** Every document that carries shippable launch copy. */
const CREATIVE_DOCS = [CAMPAIGN, MEDIA_KIT, PLAYBOOK] as const;

/**
 * Copy the campaign document has retired, and the line that replaced it.
 *
 * Retiring a line is a decision made in one file and lived with in several. The
 * missed-call hook was retired in the campaign document with a written
 * rationale — and survived as live copy in three other places: the media kit's
 * required-asset table, the playbook's messaging-test table, and a creative
 * prompt 337 lines below the retirement notice in the campaign document itself.
 * Anyone briefing a designer from any of those would have shipped it.
 *
 * A retired line may still appear where it is explicitly labelled as retired or
 * superseded, so the guard is scoped to lines that read as live copy.
 */
const RETIRED_COPY: Array<{ retired: string; replacement: string }> = [
  {
    retired: "Missed calls should not become lost revenue",
    replacement: "Every missed call is someone trying the next name on the list",
  },
];

/** A line that names the retirement is documentation, not a brief. */
const RETIREMENT_MARKERS =
  /retired|superseded|do not ship|do not use|use instead|no longer|replaced by|historical/i;

/**
 * A line carrying the retired copy AND the line that replaced it is a mapping —
 * the "use this, not that" row — which is the one place the dead phrase must
 * still appear in full. Marker words alone cannot express that, and requiring
 * one inside the table row makes the row read worse than the rule it states.
 */
function liveOccurrences(source: string, phrase: string, replacement: string): string[] {
  return source
    .split("\n")
    .filter(
      (line) =>
        line.includes(phrase) && !line.includes(replacement) && !RETIREMENT_MARKERS.test(line),
    );
}

describe("launch creative stays internally consistent", () => {
  it("never leaves retired copy readable as a live brief", () => {
    for (const doc of CREATIVE_DOCS) {
      const source = read(doc);
      for (const { retired, replacement } of RETIRED_COPY) {
        const live = liveOccurrences(source, retired, replacement);
        expect(
          live,
          `${doc} still briefs retired copy "${retired}". Use "${replacement}", ` +
            "or mark the line as retired/superseded if it is being quoted for provenance.",
        ).toEqual([]);
      }
    }
  });

  it("keeps the replacement hook actually present in the campaign document", () => {
    // Guards the inverse failure: deleting the retired line everywhere without
    // the replacement landing anywhere leaves the slot empty, and the next
    // person writes something new that nobody reviewed.
    const campaign = read(CAMPAIGN);
    for (const { replacement } of RETIRED_COPY) {
      expect(campaign, `${CAMPAIGN} does not carry the replacement hook`).toContain(replacement);
    }
  });

  /*
   * The media kit's reel doctrine and the campaign document's cut briefs are two
   * descriptions of the same films. The kit said "end card only" and "burn in
   * only four chapter words" while the hero and bumper cuts briefed their own
   * overlays and a different end line — so an editor following the kit would
   * have stripped the overlays the cut is built on.
   */
  it("does not restate cut rules the campaign document contradicts", () => {
    const kit = read(MEDIA_KIT);
    expect(kit).not.toContain("End card only:");
    expect(kit).not.toContain("Burn in only four chapter words");
    // The kit must point at the owner rather than fork it.
    expect(kit).toContain("the campaign document wins");
  });

  /*
   * The 30-second slot changed films. The audio file name did not, so the media
   * kit still described it as the generic "AI Voice Generator campaign VO"
   * while the generator had already moved to the hero narration. A kit reader
   * would have laid the 27.12s retired walkthrough over a 30s cut whose
   * narration is meant to enter at 0:20 and run eight seconds.
   */
  it("describes the 30s voiceover as the cut it actually belongs to", () => {
    const kit = read(MEDIA_KIT);
    const row = kit.split("\n").find((line) => line.includes("wireline-ai-voice-agent-30s.mp3"));
    expect(row, "the 30s VO is missing from the media kit asset table").toBeTruthy();
    expect(row).toContain("Second Ring");
    expect(row).not.toMatch(/AI Voice Generator campaign VO/);
  });

  /*
   * Every cut the campaign document briefs has to be findable from the kit,
   * because the kit is what a producer opens. The hero and the bumper were
   * written after the kit's asset table and never reached it, so the primary
   * paid cut and the cheapest-to-produce cut were both invisible to delivery.
   */
  it("lists every briefed cut in the media kit", () => {
    const kit = read(MEDIA_KIT);
    for (const cut of ["Second Ring", "Two Rings", "sound-off"]) {
      expect(kit, `the media kit never mentions the ${cut} cut`).toContain(cut);
    }
  });

  /*
   * The agent-at-full-level rule is the one piece of doctrine that is expensive
   * to follow — it requires a real captured call — and therefore the one most
   * likely to be quietly dropped. It must survive in both owners.
   */
  it("keeps the agent-audio rule in both documents", () => {
    for (const doc of [CAMPAIGN, MEDIA_KIT]) {
      expect(read(doc), `${doc} dropped the full-level agent audio rule`).toMatch(/full level/i);
    }
  });

  it("keeps the price line consistent with the plan catalog", () => {
    // The campaign promises "from $19/mo"; Starter is the live floor.
    const catalog = read("src/lib/plan-catalog.ts");
    const starter = catalog.slice(catalog.indexOf('id: "starter"'));
    expect(starter.slice(0, 400)).toContain("price_usd_monthly: 19");
    for (const doc of CREATIVE_DOCS) {
      expect(read(doc), `${doc} lost the $19 price line`).toContain("$19/mo");
    }
  });
});
