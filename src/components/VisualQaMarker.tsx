import type { ComponentType, ReactNode } from "react";
import type { Location } from "react-router";
import { useLocation } from "react-router";

type VisualQaStateResolver<Props> =
  string | ((location: Location, props: Props) => string | undefined);

export function VisualQaPageMarker({
  page,
  state,
  children,
}: {
  page: string;
  state?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="contents"
      data-visual-qa-page={page}
      {...(state ? { "data-visual-qa-state": state } : {})}
    >
      {children}
    </div>
  );
}

/**
 * Attach a non-copy visual-QA contract to a lazily loaded routed page. The
 * marker mounts only after that page module renders, so a generic app shell or
 * loading fallback cannot impersonate the intended route.
 */
export function withVisualQaPage<Props extends object>(
  module: { default: ComponentType<Props> },
  page: string,
  state?: VisualQaStateResolver<Props>,
) {
  const RoutedPage = module.default;

  function VisualQaMarkedPage(props: Props) {
    const location = useLocation();
    const resolvedState = typeof state === "function" ? state(location, props) : state;
    return (
      <VisualQaPageMarker page={page} state={resolvedState}>
        <RoutedPage {...props} />
      </VisualQaPageMarker>
    );
  }

  return { default: VisualQaMarkedPage };
}
