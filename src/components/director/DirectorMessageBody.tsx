/**
 * Lightweight markdown-style rendering for Director replies —
 * headings, lists, code, tables, links, and inline emphasis.
 */
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-design-system";
import React, { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../../lib/utils";

import { safeExternalHref } from "../../lib/safe-external-url";
import { ShadButton } from "../ui/shadcn/ShadButton";

/** Strip traffic-light emoji from headings — Account Holder UI uses tone chips instead. */
function stripAccountHolderStatusEmoji(text: string): string {
  return text
    .replace(/^[\s\u{1F534}\u{1F7E1}\u{1F7E2}\u{1F7E0}\u26AA\u2705\u274C]+/u, "")
    .trimStart();
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      nodes.push(
        <del key={key++} className="text-muted/60 line-through decoration-muted/40">
          {token.slice(2, -2)}
        </del>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="font-mono text-[12px] px-1 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.08] text-foreground/90"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("![")) {
      const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      if (imgMatch) {
        const imgSrc = safeExternalHref(imgMatch[2]);
        nodes.push(
          <span key={key++} className="block my-2">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={imgMatch[1] || "Image"}
                className="max-w-full max-h-72 rounded-md border border-brand/10 shadow-sm object-contain"
                loading="lazy"
              />
            ) : (
              <span className="wl-micro-meta--muted italic">
                {imgMatch[1] || "Image unavailable"}
              </span>
            )}
            {imgMatch[1] && (
              <span className="block wl-micro-meta--muted/60 mt-1 italic">{imgMatch[1]}</span>
            )}
          </span>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const href = safeExternalHref(linkMatch[2]);
        if (href) {
          nodes.push(
            <a
              key={key++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-2 hover:text-brand/80"
            >
              {linkMatch[1]}
            </a>,
          );
        } else {
          nodes.push(
            <span key={key++} className="text-foreground">
              {linkMatch[1]}
            </span>,
          );
        }
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code.trimEnd());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — ignore */
    }
  }, [code]);

  return (
    <div className="rounded-md border border-white/8 dark:border-white/10 overflow-hidden group">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/8 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04]">
        <span className="font-mono wl-label text-muted">{lang || "code"}</span>
        <ShadButton
          type="button"
          variant="ghost"
          size="sm"
          disableAnimations
          onClick={() => void onCopy()}
          className="h-7 min-h-0 px-2 wl-micro-meta--muted-foreground hover:text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span className="sr-only sm:not-sr-only sm:ml-1">{copied ? "Copied" : "Copy"}</span>
        </ShadButton>
      </div>
      <pre className="overflow-x-auto p-2 wl-micro-meta leading-normal font-mono text-foreground/90 bg-black/[0.03] dark:bg-white/[0.03]">
        <code>{code.trimEnd()}</code>
      </pre>
    </div>
  );
}

function MarkdownTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="app-table-scroll rounded-md border border-white/8 dark:border-white/10">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-white/8 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04]">
            {head.map((cell, i) => (
              <th key={i} className="text-left px-3 py-2 font-semibold text-foreground">
                {renderInline(cell.trim())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 dark:border-white/5 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground/85 align-top">
                  {renderInline(cell.trim())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(block: string, bi: number): React.ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("```")) {
    const fence = trimmed.match(/^```(\w+)?\n?([\s\S]*?)```$/);
    if (fence) return <CodeBlock key={bi} lang={fence[1]} code={fence[2] || ""} />;
  }

  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
    return (
      <div key={bi} className="py-1.5">
        <div className="h-px bg-gradient-to-r from-transparent via-brand/20 to-transparent" />
      </div>
    );
  }

  const lines = trimmed.split("\n");
  const first = lines[0]?.trim() ?? "";

  if (first.startsWith("### ")) {
    return (
      <h4 key={bi} className="font-display font-semibold text-foreground tracking-[-0.01em] pt-0.5">
        {renderInline(stripAccountHolderStatusEmoji(first.slice(4)))}
      </h4>
    );
  }
  if (first.startsWith("## ")) {
    return (
      <h3 key={bi} className="font-display font-bold text-foreground tracking-[-0.02em] pt-0.5">
        {renderInline(stripAccount HolderStatusEmoji(first.slice(3)))}
        {lines.slice(1).map((l, i) => (
          <span key={i} className="block font-normal text-foreground/90 mt-0.5">
            {renderInline(l)}
          </span>
        ))}
      </h3>
    );
  }
  if (first.startsWith("# ")) {
    return (
      <h2 key={bi} className="font-display font-bold text-foreground tracking-[-0.02em]">
        {renderInline(first.slice(2))}
      </h2>
    );
  }

  const isTable =
    lines.length >= 2 &&
    lines.every((l) => !l.trim() || l.includes("|")) &&
    /^\|?[\s\-:|]+\|?$/.test(lines[1]?.trim() || "");
  if (isTable) {
    const rows = lines
      .filter((l) => l.trim() && !/^\|?[\s\-:|]+\|?$/.test(l.trim()))
      .map((l) =>
        l
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
    return <MarkdownTable key={bi} rows={rows} />;
  }

  const isBullet = lines.every((l) => !l.trim() || /^[-*•]\s/.test(l.trim()));
  if (isBullet && lines.some((l) => /^[-*•]\s/.test(l.trim()))) {
    return (
      <ul key={bi} className="space-y-1 pl-1">
        {lines
          .filter((l) => /^[-*•]\s/.test(l.trim()))
          .map((l, i) => (
            <li
              key={i}
              className="font-display text-[13px] text-foreground/90 flex gap-1.5 leading-relaxed"
            >
              <span className="text-brand/50 shrink-0">•</span>
              <span>{renderInline(l.replace(/^[-*•]\s*/, ""))}</span>
            </li>
          ))}
      </ul>
    );
  }

  const isNumbered = lines.every((l) => !l.trim() || /^\d+\.\s/.test(l.trim()));
  if (isNumbered && lines.some((l) => /^\d+\.\s/.test(l.trim()))) {
    return (
      <ol key={bi} className="space-y-1 pl-1 list-none counter-reset-none">
        {lines
          .filter((l) => /^\d+\.\s/.test(l.trim()))
          .map((l, i) => {
            const text = l.replace(/^\d+\.\s*/, "");
            return (
              <li
                key={i}
                className="font-display text-[13px] text-foreground/90 flex gap-1.5 leading-relaxed"
              >
                <span className="text-brand/60 shrink-0 font-mono wl-micro-badge w-4">
                  {i + 1}.
                </span>
                <span>{renderInline(text)}</span>
              </li>
            );
          })}
      </ol>
    );
  }

  const isBlockquote = lines.every((l) => !l.trim() || l.trim().startsWith(">"));
  if (isBlockquote && lines.some((l) => l.trim().startsWith(">"))) {
    const quoteLines = lines.filter((l) => l.trim().startsWith(">"));
    const firstQuote = quoteLines[0]?.trim().replace(/^>\s*/, "") || "";
    const calloutMatch = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*(.*)$/i.exec(firstQuote);

    if (calloutMatch) {
      const cType = calloutMatch[1].toLowerCase();
      const cTitle = calloutMatch[2]?.trim() || calloutMatch[1];
      const cBody = quoteLines
        .slice(1)
        .map((l) => l.replace(/^>\s*/, ""))
        .join(" ");
      const palette: Record<string, { border: string; bg: string; label: string }> = {
        note: {
          border: "border-l-brand/35",
          bg: "bg-brand/[0.06]",
          label: "text-brand",
        },
        tip: {
          border: "border-l-brand/50",
          bg: "bg-brand/[0.08]",
          label: "text-brand-deep",
        },
        warning: {
          border: "border-l-brand-deep/50",
          bg: "bg-brand/[0.05]",
          label: "text-brand-deep",
        },
        important: {
          border: "border-l-brand",
          bg: "bg-brand/[0.07]",
          label: "text-brand",
        },
        caution: {
          border: "border-l-destructive/40",
          bg: "bg-destructive/[0.06]",
          label: "text-destructive",
        },
      };
      const cp = palette[cType] || palette.note;
      return (
        <div key={bi} className={cn("rounded-md border-l-[3px] px-3.5 py-2.5", cp.border, cp.bg)}>
          <p className={cn("text-eyebrow font-bold tracking-[0.12em] mb-1", cp.label)}>{cTitle}</p>
          {cBody && (
            <p className="font-display text-[13px] text-foreground/85 leading-relaxed">
              {renderInline(cBody)}
            </p>
          )}
        </div>
      );
    }

    return (
      <blockquote key={bi} className="border-l-2 border-brand/25 pl-3.5 py-0.5">
        {quoteLines.map((l, i) => (
          <p key={i} className="font-display text-[13px] text-foreground/70 italic leading-relaxed">
            {renderInline(l.replace(/^>\s*/, ""))}
          </p>
        ))}
      </blockquote>
    );
  }

  return (
    <p
      key={bi}
      className="font-display text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap"
    >
      {renderInline(trimmed)}
    </p>
  );
}

export function DirectorMessageBody({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const segments: string[] = [];
  const codeFence = /```[\s\S]*?```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = codeFence.exec(content)) !== null) {
    if (match.index > cursor) {
      segments.push(...content.slice(cursor, match.index).split(/\n\n+/));
    }
    segments.push(match[0]);
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) {
    segments.push(...content.slice(cursor).split(/\n\n+/));
  }

  return (
    <div className={cn("space-y-1.5", WL_DIRECTOR_CLASSES.docBody, className)}>
      {segments.map((block, bi) => renderBlock(block, bi))}
    </div>
  );
}
