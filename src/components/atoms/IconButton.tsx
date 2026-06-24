import * as React from "react";
import { Button, type ButtonProps } from "./Button";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "size"> {
  label: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, children, size = "md", ...props }, ref) => (
    <Button
      ref={ref}
      size={size === "sm" ? "icon-sm" : "icon"}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  ),
);
IconButton.displayName = "IconButton";
