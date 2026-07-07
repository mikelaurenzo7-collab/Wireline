import type { CSSProperties, ElementType, ReactNode } from "react";

import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { cn } from "../../lib/utils";

type WiredEyebrowProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
};

/** Letterpress wired section kicker — silver strand + mono label. */
export function WiredEyebrow({ children, className, style, as: Tag = "p" }: WiredEyebrowProps) {
  return (
    <Tag className={cn(WL_APP_CLASSES.wiredEyebrow, className)} style={style}>
      {children}
    </Tag>
  );
}
