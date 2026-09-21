import * as React from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { cn } from "@/lib/utils";

export interface SearchFieldProps extends Omit<React.ComponentProps<typeof Input>, "type"> {
  onClear?: () => void;
  clearLabel?: string;
}

const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, onClear, clearLabel = "Clear search", value, ...props }, ref) => {
    const hasValue = typeof value === "string" && value.length > 0;

    return (
      <div className={cn("relative flex items-center", className)}>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
        />
        <Input
          ref={ref}
          type="search"
          value={value}
          className={cn(
            "pl-9 pr-9",
            onClear && "[&::-webkit-search-cancel-button]:appearance-none",
          )}
          {...props}
        />
        {hasValue && onClear && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={clearLabel}
            onClick={onClear}
            className="absolute right-0 h-9 w-9 rounded-l-none text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";

export { SearchField };
