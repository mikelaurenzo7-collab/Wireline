import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Keep message content as text; only explicit web addresses become links. */
export default function LinkifiedText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of children.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const start = match.index;
    let address = match[0].replace(/[.,;:!?]+$/, "");
    while (
      address.endsWith(")") &&
      (address.match(/\)/g)?.length ?? 0) > (address.match(/\(/g)?.length ?? 0)
    ) {
      address = address.slice(0, -1);
    }
    let safe = false;
    try {
      const url = new URL(address);
      safe = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      // Leave incomplete or malformed addresses as ordinary text.
    }
    parts.push(children.slice(offset, start));
    parts.push(
      safe ? (
        <a
          key={start}
          href={address}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={cn(
            "text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary wl-focus-ring-halo",
            className,
          )}
        >
          {address}
        </a>
      ) : (
        address
      ),
    );
    offset = start + address.length;
  }
  parts.push(children.slice(offset));
  return <>{parts}</>;
}
