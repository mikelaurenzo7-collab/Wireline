import type { RequestHandler } from "express";

/**
 * Authentication responses are always user-specific or security-sensitive.
 * Keep browsers and shared intermediaries from reusing them across a session
 * transition, and make both supported credential transports part of the cache
 * key even when an intermediary ignores `no-store`.
 */
export const protectAuthResponseFromCaching: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.vary("Cookie");
  res.vary("Authorization");
  next();
};
