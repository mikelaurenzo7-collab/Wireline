import { useState, type CSSProperties } from "react";

type SkipToContentLinkProps = {
  href: `#${string}`;
  children?: string;
};

const baseStyle: CSSProperties = {
  position: "fixed",
  left: "0.75rem",
  top: "max(0.75rem, env(safe-area-inset-top))",
  zIndex: 9999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--wireline-color-action-primary-default)",
  borderRadius: "var(--radius-md)",
  padding: "0.5rem 0.75rem",
  background: "var(--wireline-color-action-primary-default)",
  color: "var(--wireline-color-text-onAction)",
  fontSize: "0.875rem",
  fontWeight: 700,
  lineHeight: 1,
  textDecoration: "none",
  transition: "opacity 120ms ease, transform 120ms ease",
};

const hiddenStyle: CSSProperties = {
  ...baseStyle,
  width: "1px",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  opacity: 0,
  pointerEvents: "none",
  transform: "translateY(calc(-100% - 1.5rem))",
  whiteSpace: "nowrap",
};

const focusedStyle: CSSProperties = {
  ...baseStyle,
  minHeight: "2.75rem",
  width: "auto",
  height: "auto",
  margin: 0,
  clipPath: "none",
  opacity: 1,
  pointerEvents: "auto",
  transform: "translateY(0)",
  whiteSpace: "normal",
};

export default function SkipToContentLink({
  href,
  children = "Skip to content",
}: SkipToContentLinkProps) {
  const [focused, setFocused] = useState(false);

  return (
    <a
      className="wl-skip-link"
      href={href}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      style={focused ? focusedStyle : hiddenStyle}
    >
      {children}
    </a>
  );
}
