import { AppError } from "../api-error";
import type { OwnerControlInput } from "./browser-session";

function pointFrom(value: unknown): { x: number; y: number } {
  if (!value || typeof value !== "object")
    throw AppError.badRequest("Choose a point on the browser screen.");
  const point = value as Record<string, unknown>;
  if (
    typeof point.x !== "number" ||
    typeof point.y !== "number" ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > 1280 ||
    point.y < 0 ||
    point.y > 800
  ) {
    throw AppError.badRequest("Choose a point inside the browser screen.");
  }
  return { x: point.x, y: point.y };
}

export function ownerInputFrom(value: unknown): OwnerControlInput {
  if (!value || typeof value !== "object") throw AppError.badRequest("Choose a browser action.");
  const input = value as Record<string, unknown>;
  if (input.kind === "click") {
    const point = pointFrom(input);
    return { kind: "click", ...point };
  }
  if (input.kind === "drag") {
    return { kind: "drag", from: pointFrom(input.from), to: pointFrom(input.to) };
  }
  if (input.kind === "scroll") {
    const point = pointFrom(input);
    if (
      typeof input.deltaX !== "number" ||
      typeof input.deltaY !== "number" ||
      !Number.isFinite(input.deltaX) ||
      !Number.isFinite(input.deltaY) ||
      Math.abs(input.deltaX) > 1_200 ||
      Math.abs(input.deltaY) > 1_200
    ) {
      throw AppError.badRequest("Choose a scroll movement inside the allowed range.");
    }
    return { kind: "scroll", ...point, deltaX: input.deltaX, deltaY: input.deltaY };
  }
  if (input.kind === "navigate") {
    if (typeof input.url !== "string" || !input.url || input.url.length > 2_048) {
      throw AppError.badRequest("Enter a web address up to 2,048 characters long.");
    }
    return { kind: "navigate", url: input.url };
  }
  if (input.kind === "history") {
    if (input.action !== "back" && input.action !== "forward" && input.action !== "reload") {
      throw AppError.badRequest("Choose Back, Forward, or Reload.");
    }
    return { kind: "history", action: input.action };
  }
  if (input.kind === "type") {
    if (typeof input.text !== "string" || !input.text || input.text.length > 1_000) {
      throw AppError.badRequest("Enter up to 1,000 characters to send to the focused page field.");
    }
    return { kind: "type", text: input.text };
  }
  if (input.kind === "key") {
    if (typeof input.key !== "string" || input.key.length > 20) {
      throw AppError.badRequest("Choose a supported navigation key.");
    }
    return { kind: "key", key: input.key };
  }
  throw AppError.badRequest("That browser action is not supported.");
}
