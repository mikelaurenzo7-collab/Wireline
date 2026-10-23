import { AppError } from "../api-error";
import type { OwnerControlInput } from "./browser-session";
import { OWNER_BROWSER_CAPABILITIES, type OwnerBrowserCookie } from "./browser-capabilities";
import { checkUrlAllowed } from "./url-policy";

function ownerOriginFrom(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) {
    throw AppError.badRequest("Check the current HTTPS site before using a saved login.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw AppError.badRequest("Check the current HTTPS site before using a saved login.");
  }
  if (
    url.protocol !== "https:" ||
    !checkUrlAllowed(url).allowed ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw AppError.badRequest("Check the current HTTPS site before using a saved login.");
  }
  return url.origin;
}

/** Canonical cookie JSON only; never read or export a local browser profile. */
export function ownerCookiesFrom(value: unknown): OwnerBrowserCookie[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > OWNER_BROWSER_CAPABILITIES.maxCookiesPerImport ||
    Buffer.byteLength(JSON.stringify(value), "utf8") >
      OWNER_BROWSER_CAPABILITIES.maxCookieImportBytes
  ) {
    throw AppError.badRequest("Import 1 to 50 cookies in a JSON array up to 64 KB.");
  }
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw AppError.badRequest("Check the cookie JSON format.");
    const cookie = item as Record<string, unknown>;
    if (
      typeof cookie.name !== "string" ||
      !/^[!#$%&'*+.^_`|~A-Za-z0-9-]{1,256}$/.test(cookie.name) ||
      typeof cookie.value !== "string" ||
      cookie.value.length > 4_096 ||
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u001f\u007f]/.test(cookie.value)
    ) {
      throw AppError.badRequest("Check the cookie names and values.");
    }
    const result: OwnerBrowserCookie = { name: cookie.name, value: cookie.value, secure: true };
    if (cookie.url !== undefined) {
      if (
        typeof cookie.url !== "string" ||
        cookie.url.length > 2_048 ||
        cookie.domain !== undefined
      ) {
        throw AppError.badRequest("Each cookie needs either an HTTPS URL or a domain and path.");
      }
      let url: URL;
      try {
        url = new URL(cookie.url);
      } catch {
        throw AppError.badRequest("Use HTTPS cookie URLs.");
      }
      if (url.protocol !== "https:" || !checkUrlAllowed(url).allowed) {
        throw AppError.badRequest("Cookies can only be imported for public HTTPS sites.");
      }
      // A cookie URL identifies its scope; never retain login tokens in its query.
      url.search = "";
      url.hash = "";
      result.url = url.toString();
    } else {
      if (
        typeof cookie.domain !== "string" ||
        !/^\.?[a-zA-Z0-9.-]{1,253}$/.test(cookie.domain) ||
        typeof cookie.path !== "string" ||
        !cookie.path.startsWith("/") ||
        cookie.path.length > 2_048 ||
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u001f\u007f]/.test(cookie.path)
      ) {
        throw AppError.badRequest("Each domain cookie needs a valid domain and path.");
      }
      let url: URL;
      try {
        url = new URL(`https://${cookie.domain.replace(/^\./, "")}/`);
      } catch {
        throw AppError.badRequest("Check the cookie domains.");
      }
      if (!checkUrlAllowed(url).allowed) {
        throw AppError.badRequest("Cookies can only be imported for public HTTPS sites.");
      }
      result.domain = cookie.domain.toLowerCase();
      result.path = cookie.path;
    }
    if (cookie.secure !== undefined && cookie.secure !== true) {
      throw AppError.badRequest("Imported cookies must be restricted to HTTPS.");
    }
    if (cookie.httpOnly !== undefined) {
      if (typeof cookie.httpOnly !== "boolean")
        throw AppError.badRequest("Check the cookie httpOnly setting.");
      result.httpOnly = cookie.httpOnly;
    }
    if (cookie.sameSite !== undefined) {
      if (
        typeof cookie.sameSite !== "string" ||
        !["Strict", "Lax", "None"].includes(cookie.sameSite)
      ) {
        throw AppError.badRequest("Use Strict, Lax, or None for cookie sameSite.");
      }
      result.sameSite = cookie.sameSite as OwnerBrowserCookie["sameSite"];
    }
    if (cookie.expires !== undefined && cookie.expires !== -1) {
      if (
        typeof cookie.expires !== "number" ||
        !Number.isFinite(cookie.expires) ||
        cookie.expires <= Date.now() / 1_000
      ) {
        throw AppError.badRequest("Check the cookie expiry time in Unix seconds.");
      }
      result.expires = cookie.expires;
    }
    return result;
  });
}

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
  if (input.kind === "new_tab") {
    if (
      input.url !== undefined &&
      (typeof input.url !== "string" || !input.url || input.url.length > 2_048)
    ) {
      throw AppError.badRequest("Enter a web address up to 2,048 characters long.");
    }
    return { kind: "new_tab", ...(typeof input.url === "string" ? { url: input.url } : {}) };
  }
  if (input.kind === "switch_tab" || input.kind === "close_tab") {
    if (typeof input.tabId !== "string" || !/^tab-[1-9]\d*$/.test(input.tabId)) {
      throw AppError.badRequest("Choose an open browser tab.");
    }
    return { kind: input.kind, tabId: input.tabId };
  }
  if (input.kind === "import_cookies") {
    return { kind: "import_cookies", cookies: ownerCookiesFrom(input.cookies) };
  }
  if (input.kind === "clear_cookies") {
    return { kind: input.kind };
  }
  if (input.kind === "fill_login" || input.kind === "clear_saved_login") {
    return { kind: input.kind, origin: ownerOriginFrom(input.origin) };
  }
  if (input.kind === "save_login") {
    if (
      typeof input.username !== "string" ||
      typeof input.password !== "string" ||
      !input.password ||
      input.username.length > 1_000 ||
      input.password.length > 1_000
    ) {
      throw AppError.badRequest("Enter a username and password up to 1,000 characters each.");
    }
    return {
      kind: "save_login",
      origin: ownerOriginFrom(input.origin),
      username: input.username,
      password: input.password,
    };
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
