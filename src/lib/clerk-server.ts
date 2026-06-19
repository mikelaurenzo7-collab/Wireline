import { createClerkClient, type ClerkClient } from "@clerk/backend";

let cached: ClerkClient | null = null;

export function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim());
}

export function getClerkClient(): ClerkClient {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is not configured");
  }
  if (!cached) {
    cached = createClerkClient({ secretKey });
  }
  return cached;
}
