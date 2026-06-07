/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  artifactIdFromDirectorSignedUrl,
  type DirectorArtifactInlineSrc,
  useDirectorArtifactBlobSrc,
} from "./useDirectorArtifactInlineSrc";

describe("artifactIdFromDirectorSignedUrl", () => {
  it("extracts artifact ids from relative signed preview URLs", () => {
    expect(
      artifactIdFromDirectorSignedUrl(
        "/api/director/artifacts/stitch%2Fhtml/download?exp=1&sig=s&inline=1",
      ),
    ).toBe("stitch/html");
  });

  it("extracts artifact ids from absolute signed preview URLs", () => {
    expect(
      artifactIdFromDirectorSignedUrl(
        "https://trywireline.com/api/director/artifacts/image-123/download?exp=1&sig=s",
      ),
    ).toBe("image-123");
  });

  it("ignores non-director artifact URLs", () => {
    expect(artifactIdFromDirectorSignedUrl("https://example.com/file.png")).toBeUndefined();
  });
});

describe("useDirectorArtifactBlobSrc", () => {
  async function flushReactWork() {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("revokes an expired active blob URL after the hook is disabled and unmounted", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);

    const blobUrl = "blob:director-artifact-old";
    const createObjectURL = vi.fn(() => blobUrl);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "/signed-artifact" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["artifact"]),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    let current: DirectorArtifactInlineSrc | undefined;
    const container = document.createElement("div");
    let root: Root | undefined = createRoot(container);
    function Harness({ enabled }: { enabled: boolean }) {
      current = useDirectorArtifactBlobSrc("disable-unmount-regression", { enabled });
      return null;
    }

    await act(async () => {
      root?.render(createElement(Harness, { enabled: true }));
    });
    await flushReactWork();

    expect(current?.src).toBe(blobUrl);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    now.mockReturnValue(6 * 60 * 1000);
    await act(async () => {
      root?.render(createElement(Harness, { enabled: false }));
    });
    await flushReactWork();
    expect(current?.src).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith(blobUrl);

    await act(async () => {
      root?.unmount();
      root = undefined;
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
