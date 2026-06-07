import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleStitchRuntime } from "./google-stitch-sdk-client";
import {
  mapStitchError,
  projectEntityToRef,
  screenEntityToRecord,
} from "./google-stitch-sdk-helpers";
import { GoogleStitchError } from "./google-stitch-mcp-client";

const sdkMock = vi.hoisted(() => ({
  clientOptions: [] as Array<Record<string, unknown>>,
  close: vi.fn(async () => undefined),
}));

vi.mock("@google/stitch-sdk", () => ({
  StitchToolClient: class StitchToolClient {
    constructor(options: Record<string, unknown>) {
      sdkMock.clientOptions.push(options);
    }

    close = sdkMock.close;
  },
  Stitch: class Stitch {
    client: unknown;

    constructor(client: unknown) {
      this.client = client;
    }
  },
}));

function clearRuntimeStitchEnv() {
  vi.stubEnv("GOOGLE_STITCH_API_KEY", "");
  vi.stubEnv("STITCH_API_KEY", "");
  vi.stubEnv("STITCH_ACCESS_TOKEN", "");
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
}

describe("google stitch runtime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sdkMock.clientOptions.length = 0;
    sdkMock.close.mockClear();
  });

  it("requires API-key auth or OAuth quota-project auth", async () => {
    clearRuntimeStitchEnv();

    await expect(createGoogleStitchRuntime()).rejects.toMatchObject({
      code: "AUTH_FAILED",
    });
  });

  it("prefers GOOGLE_STITCH_API_KEY for the SDK client", async () => {
    vi.stubEnv("GOOGLE_STITCH_API_KEY", "stitch-key");
    vi.stubEnv("STITCH_ACCESS_TOKEN", "oauth-token");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "quota-project");

    await createGoogleStitchRuntime();

    expect(sdkMock.clientOptions[0]).toMatchObject({
      apiKey: "stitch-key",
      accessToken: undefined,
      projectId: undefined,
      baseUrl: "https://stitch.googleapis.com/mcp",
    });
  });

  it("supports the SDK OAuth alternative when no API key is set", async () => {
    clearRuntimeStitchEnv();
    vi.stubEnv("STITCH_ACCESS_TOKEN", "oauth-token");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "quota-project");

    await createGoogleStitchRuntime();

    expect(sdkMock.clientOptions[0]).toMatchObject({
      apiKey: undefined,
      accessToken: "oauth-token",
      projectId: "quota-project",
    });
  });
});

describe("google stitch sdk helpers", () => {
  it("passes through GoogleStitchError", () => {
    const err = new GoogleStitchError("slow down", "RATE_LIMITED", true);
    expect(mapStitchError(err)).toBe(err);
  });

  it("maps stitch-shaped errors to GoogleStitchError", () => {
    const err = Object.assign(new Error("slow down"), {
      code: "RATE_LIMITED",
      recoverable: true,
    });
    const mapped = mapStitchError(err);
    expect(mapped).toBeInstanceOf(GoogleStitchError);
    expect(mapped.code).toBe("RATE_LIMITED");
    expect(mapped.recoverable).toBe(true);
  });

  it("maps generic errors to GoogleStitchError", () => {
    const mapped = mapStitchError(new Error("boom"));
    expect(mapped).toBeInstanceOf(GoogleStitchError);
    expect(mapped.message).toBe("boom");
    expect(mapped.code).toBe("UNKNOWN_ERROR");
  });

  it("projects screen entities into parser-friendly records", () => {
    const record = screenEntityToRecord({
      screenId: "98b50e2ddc9943efb387052637738f61",
      projectId: "4044680601076201931",
      data: {
        screenshot: { downloadUrl: "https://storage.googleapis.com/a.png" },
      },
    });
    expect(record.screenId).toBe("98b50e2ddc9943efb387052637738f61");
    expect(record.projectId).toBe("4044680601076201931");
    expect(record.screenshot).toBeDefined();
  });

  it("projects project entities into stitch project refs", () => {
    const ref = projectEntityToRef({
      projectId: "222",
      data: { title: "Wireline", projectType: "TEXT_TO_UI_PRO" },
    });
    expect(ref.projectId).toBe("222");
    expect(ref.title).toBe("Wireline");
    expect(ref.projectType).toBe("TEXT_TO_UI_PRO");
  });
});
