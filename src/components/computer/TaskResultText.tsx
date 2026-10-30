import type { ReactNode } from "react";
import LinkifiedText from "../ui/LinkifiedText";

const INLINE_LABELED_ITEM = /\s+-\s+(?=[A-Z][A-Za-z0-9 +/&'-]{0,32}:)/g;

function readableBlocks(text: string): string[] {
  // Browsing models sometimes return compact prose such as
  // "Monthly: - Calls: ... - Email: ..." even when asked for Markdown.
  // Preserve ordinary hyphenated prose, but recover repeated labeled items.
  const sectioned = text.replace(
    /([.!?])\s+([A-Z][A-Za-z ]{1,24}:)(?=\s+-\s+)/g,
    "$1\n\n$2",
  );

  return sectioned.split(/\n\s*\n/).flatMap((block) => {
    if (block.includes("\n")) return [block];
    const [intro, ...items] = block.split(INLINE_LABELED_ITEM);
    if (items.length < 2) return [block];
    const list = items.map((item) => `- ${item.trim()}`).join("\n");
    return intro.trim() ? [intro.trim(), list] : [list];
  });
}

/** A small text-only Markdown subset. HTML is always rendered as literal text. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    const start = match.index;
    parts.push(<LinkifiedText key={`text-${start}`}>{text.slice(offset, start)}</LinkifiedText>);
    if (match[1]) parts.push(<strong key={start}>{match[1]}</strong>);
    else {
      let safe = false;
      try {
        const url = new URL(match[3]!);
        safe = !url.username && !url.password && ["https:", "http:"].includes(url.protocol);
      } catch {
        /* Render malformed links as text. */
      }
      parts.push(
        safe ? (
          <a key={start} href={match[3]} target="_blank" rel="noopener noreferrer nofollow">
            {match[2]}
          </a>
        ) : (
          match[0]
        ),
      );
    }
    offset = start + match[0].length;
  }
  parts.push(<LinkifiedText key="tail">{text.slice(offset)}</LinkifiedText>);
  return parts;
}
export default function TaskResultText({ children }: { children: string }) {
  return (
    <div className="wl-task-result-text">
      {readableBlocks(children).map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line)))
          return (
            <ul key={index}>
              {lines.map((line, n) => (
                <li key={n}>{inline(line.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line)))
          return (
            <ol key={index} start={Number.parseInt(lines[0]!, 10)}>
              {lines.map((line, n) => (
                <li key={n}>{inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>
              ))}
            </ol>
          );
        return (
          <p key={index}>
            {lines.map((line, n) => (
              <span key={n}>
                {n > 0 ? <br /> : null}
                {inline(line.replace(/^#{1,6}\s+/, ""))}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
