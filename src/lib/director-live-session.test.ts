import { describe, it, expect } from "vitest";
import { buildDirectorLiveSteps } from "../components/director/DirectorLiveSession";
import { DIRECTOR_LIVE_STEP_COPY } from "./wireline-director-design";

describe("buildDirectorLiveSteps — design-aligned copy", () => {
  it("uses fleet scan copy when coaching is inactive", () => {
    const steps = buildDirectorLiveSteps({
      hasIntegrations: true,
      fleetSize: 3,
    });
    expect(steps[0].title).toBe(DIRECTOR_LIVE_STEP_COPY.contextFleet(3));
    expect(steps[1].title).toBe(DIRECTOR_LIVE_STEP_COPY.integrationsOn);
    expect(steps[2].title).toBe(DIRECTOR_LIVE_STEP_COPY.executeTitle);
    expect(steps[3].title).toBe(DIRECTOR_LIVE_STEP_COPY.composeFleet);
  });

  it("uses coach-specific copy when an agent is selected", () => {
    const steps = buildDirectorLiveSteps({
      hasIntegrations: false,
      coachAgentName: "Casey",
      fleetSize: 6,
    });
    expect(steps[0].title).toBe(DIRECTOR_LIVE_STEP_COPY.contextCoach("Casey"));
    expect(steps[1].title).toBe(DIRECTOR_LIVE_STEP_COPY.integrationsOff);
    expect(steps[3].title).toBe(DIRECTOR_LIVE_STEP_COPY.composeCoach);
  });
});
