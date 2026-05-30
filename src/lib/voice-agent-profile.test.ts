import { describe, expect, it } from "vitest";
import {
  resolveVapiSpeechPipeline,
  showcaseTranscriberModeForAgent,
  VAPI_TRANSCRIBER_FLUX_CONFIG,
  VAPI_TRANSCRIBER_CONFIG,
} from "./voice-agent-profile";

describe("resolveVapiSpeechPipeline", () => {
  it("nova-livekit keeps Nova-3 transcriber and LiveKit smart endpointing", () => {
    const pipeline = resolveVapiSpeechPipeline("nova-livekit");
    expect(pipeline.transcriber).toEqual(VAPI_TRANSCRIBER_CONFIG);
    expect(pipeline.startSpeakingPlan).toHaveProperty("smartEndpointingPlan");
  });

  it("flux-eot uses Flux transcriber without smartEndpointingPlan", () => {
    const pipeline = resolveVapiSpeechPipeline("flux-eot");
    expect(pipeline.transcriber).toEqual(VAPI_TRANSCRIBER_FLUX_CONFIG);
    expect(pipeline.startSpeakingPlan).not.toHaveProperty("smartEndpointingPlan");
    expect(pipeline.transcriber.eotThreshold).toBe(0.62);
    expect(pipeline.transcriber.eotTimeoutMs).toBe(3200);
  });
});

describe("showcaseTranscriberModeForAgent", () => {
  it("assigns Flux only to Liam for employee-line A/B", () => {
    expect(showcaseTranscriberModeForAgent("Liam")).toBe("flux-eot");
    expect(showcaseTranscriberModeForAgent("Sarah")).toBe("nova-livekit");
  });
});
