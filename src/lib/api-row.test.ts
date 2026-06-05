import { describe, expect, it } from "vitest";
import { apiField, apiNum, apiStr } from "./api-row";

describe("api-row", () => {
  it("reads snake_case and camelCase", () => {
    const row = { customer_number: "+1", lastMessageAt: "2026-01-01T00:00:00.000Z" };
    expect(apiStr(row, "customer_number")).toBe("+1");
    expect(apiField(row, "last_message_at")).toBe("2026-01-01T00:00:00.000Z");
    expect(apiNum({ unread_count: 2 }, "unread_count")).toBe(2);
    expect(apiNum({ unreadCount: 3 }, "unread_count")).toBe(3);
  });
});
