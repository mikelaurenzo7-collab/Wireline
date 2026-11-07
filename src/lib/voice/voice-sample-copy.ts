/** Browser-safe copy shared by the displayed comparison and both speech services. */
export function voiceSampleLine(agentName: string): string {
  const name =
    agentName
      .replace(/[^\p{L}\p{N}' .&-]/gu, "")
      .trim()
      .slice(0, 40) || "your Bot";
  return `Hi, thanks for calling. This is ${name}. How can I help you today?`;
}
