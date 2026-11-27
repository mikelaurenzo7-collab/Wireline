const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/**
 * Whether what was said includes this phone number, however it was written
 * out: digit by digit in words ("seven seven three, six nine four, ..."), as
 * figures, or with punctuation between the groups.
 */
export function saysPhoneNumber(said: string, phoneNumber: string | null | undefined): boolean {
  const digits = String(phoneNumber ?? "")
    .replace(/\D/g, "")
    .slice(-10);
  if (digits.length < 7) return false;
  const heard = said
    .toLowerCase()
    .replace(/[a-z']+/g, (word) => DIGIT_WORDS[word] ?? " ")
    .replace(/\D/g, "");
  return heard.includes(digits);
}
