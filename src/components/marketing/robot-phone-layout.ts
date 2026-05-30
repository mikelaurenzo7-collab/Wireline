/** Head shell rect in the 64×64 phone-pose viewBox (see RobotHead HeadShell). */
export const ROBOT_HEAD_LEFT = 12;
export const ROBOT_HEAD_RIGHT = 52;
export const ROBOT_PHONE_W = 10;
/** Overlap into the head edge so the phone reads “at the ear”. */
export const ROBOT_PHONE_EAR_OVERLAP = 7;

export type RobotPhonePose = "phone" | "on-call";

/**
 * Phone placement for hero gutter robots.
 * Left-gutter stickers face inward — phone on the right cheek toward the headline.
 */
export function phoneLayoutForGutter(gutterSide: "left" | "right", pose: RobotPhonePose) {
  const phoneSide: "left" | "right" = gutterSide === "left" ? "right" : "left";
  const phoneOffset =
    phoneSide === "left"
      ? ROBOT_HEAD_LEFT - ROBOT_PHONE_W + ROBOT_PHONE_EAR_OVERLAP
      : ROBOT_HEAD_RIGHT - ROBOT_PHONE_EAR_OVERLAP;
  const phoneY = pose === "on-call" ? 19 : 20;
  return { phoneSide, phoneOffset, phoneY };
}

/** True when the phone rect overlaps the head shell on the ear side. */
export function phoneOverlapsHead(phoneOffset: number): boolean {
  const phoneRight = phoneOffset + ROBOT_PHONE_W;
  return phoneOffset < ROBOT_HEAD_RIGHT && phoneRight > ROBOT_HEAD_LEFT;
}
