import * as React from "react";

export type NativeSelectProps = React.ComponentProps<"select">;

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  (props, ref) => <select ref={ref} {...props} />,
);

NativeSelect.displayName = "NativeSelect";
