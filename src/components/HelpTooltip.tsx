import React from "react";
import { HelpTooltip as CanonicalHelpTooltip } from "./atoms/HelpTooltip";

interface HelpTooltipProps {
  content: string;
  title?: string;
  placement?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
}

export function HelpTooltip({ content, title, placement = "top", children }: HelpTooltipProps) {
  const trigger = React.isValidElement(children) ? children : undefined;
  const detail = title ? (
    <>
      <span className="block font-semibold text-foreground">{title}</span>
      <span className="mt-1 block">{content}</span>
    </>
  ) : (
    content
  );

  return (
    <CanonicalHelpTooltip content={detail} label={title || "Help"} side={placement}>
      {trigger}
    </CanonicalHelpTooltip>
  );
}
