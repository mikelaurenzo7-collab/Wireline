export const MAX_PASSWORD_BYTES = 256;

export function passwordFitsByteLimit(password: string): boolean {
  return Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}
