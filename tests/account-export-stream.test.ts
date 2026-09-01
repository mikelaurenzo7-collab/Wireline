import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import {
  AccountExportStreamClosedError,
  type AccountExportWritable,
  writeAccountExportChunk,
} from "../src/lib/account-export-stream";

class FakeExportResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  readonly chunks: string[] = [];

  constructor(private readonly backpressured: boolean) {
    super();
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return !this.backpressured;
  }

  asWritable(): AccountExportWritable {
    return this as unknown as AccountExportWritable;
  }
}

describe("account export response backpressure", () => {
  it("returns immediately when Node accepts the chunk", async () => {
    const response = new FakeExportResponse(false);

    await expect(
      writeAccountExportChunk(response.asWritable(), "accepted"),
    ).resolves.toBeUndefined();

    expect(response.chunks).toEqual(["accepted"]);
    expect(response.eventNames()).toEqual([]);
  });

  it("waits for drain and removes terminal listeners before fetching more data", async () => {
    const response = new FakeExportResponse(true);
    let settled = false;
    const pending = writeAccountExportChunk(response.asWritable(), "buffered").then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(response.listenerCount("drain")).toBe(1);
    expect(response.listenerCount("close")).toBe(1);
    expect(response.listenerCount("error")).toBe(1);

    response.emit("drain");
    await pending;

    expect(settled).toBe(true);
    expect(response.eventNames()).toEqual([]);
  });

  it("rejects instead of hanging when the client closes before drain", async () => {
    const response = new FakeExportResponse(true);
    const pending = expect(
      writeAccountExportChunk(response.asWritable(), "buffered"),
    ).rejects.toBeInstanceOf(AccountExportStreamClosedError);

    response.destroyed = true;
    response.emit("close");
    await pending;

    expect(response.eventNames()).toEqual([]);
  });
});
