import * as React from "react";
import { Bot, Mail, UserRound } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const conversationMessageVariants = cva(
  "max-w-[92%] rounded-[var(--radius-lg)] border p-3.5 text-sm leading-6",
  {
    variants: {
      author: {
        customer: "mr-auto border-border bg-card text-foreground",
        assistant: "ml-auto border-primary/25 bg-primary/10 text-foreground",
        system:
          "mx-auto max-w-full border-border bg-[var(--wireline-surface-subtle)] text-foreground",
      },
    },
    defaultVariants: {
      author: "customer",
    },
  },
);

export interface ConversationMessageProps
  extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof conversationMessageVariants> {
  label?: React.ReactNode;
  timestamp?: React.ReactNode;
  channel?: "email" | "text" | "voice";
}

function defaultIcon(author: NonNullable<ConversationMessageProps["author"]>) {
  if (author === "assistant") return <Bot aria-hidden="true" className="size-3.5" />;
  if (author === "system") return <Mail aria-hidden="true" className="size-3.5" />;
  return <UserRound aria-hidden="true" className="size-3.5" />;
}

const defaultLabel: Record<NonNullable<ConversationMessageProps["author"]>, string> = {
  customer: "Customer",
  assistant: "Wireline assistant",
  system: "System record",
};

const ConversationMessage = React.forwardRef<HTMLElement, ConversationMessageProps>(
  ({ author = "customer", label, timestamp, channel, className, children, ...props }, ref) => (
    <article
      ref={ref}
      data-slot="conversation-message"
      data-author={author}
      data-channel={channel}
      className={cn(conversationMessageVariants({ author }), className)}
      {...props}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">
        <span className="inline-flex size-4 items-center justify-center" aria-hidden="true">
          {defaultIcon(author)}
        </span>
        <span>{label ?? defaultLabel[author]}</span>
        {channel ? <span className="text-muted-foreground/75">· {channel}</span> : null}
      </div>
      <div className="whitespace-pre-wrap">{children}</div>
      {timestamp ? <p className="mt-2 text-[11px] text-muted-foreground">{timestamp}</p> : null}
    </article>
  ),
);
ConversationMessage.displayName = "ConversationMessage";

export { ConversationMessage };
