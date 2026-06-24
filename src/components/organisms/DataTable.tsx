import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Skeleton } from "@/components/atoms/Skeleton";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  sort?: "ascending" | "descending" | "none";
  onSort?: () => void;
};

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T, index: number) => React.Key;
  caption: string;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  className?: string;
  onRowClick?: (row: T) => void;
}

function SortIcon({ sort }: { sort: DataTableColumn<unknown>["sort"] }) {
  if (sort === "ascending") return <ArrowUp aria-hidden="true" className="size-3" />;
  if (sort === "descending") return <ArrowDown aria-hidden="true" className="size-3" />;
  return <ArrowUpDown aria-hidden="true" className="size-3" />;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
  emptyAction,
  loading = false,
  loadingRows = 5,
  className,
  onRowClick,
}: DataTableProps<T>) {
  const skeletonRows = Array.from({ length: loadingRows });

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-[var(--wl-shadow-sm)]", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-secondary/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={column.sort && column.sort !== "none" ? column.sort : undefined}
                  className={cn(
                    "px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:px-5",
                    column.headerClassName,
                  )}
                >
                  {column.onSort ? (
                    <button
                      type="button"
                      onClick={column.onSort}
                      className="inline-flex items-center gap-1.5 rounded text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      {column.header}
                      <SortIcon sort={column.sort} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading
              ? skeletonRows.map((_, index) => (
                  <tr key={`skeleton-${index}`}>
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-4 sm:px-5">
                        <Skeleton shape="text" className="h-4 w-full max-w-[13rem]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, index) => (
                  <tr
                    key={getRowId(row, index)}
                    className={cn(onRowClick && "cursor-pointer transition-colors hover:bg-secondary/65 focus-within:bg-secondary/65")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((column) => (
                      <td key={column.id} className={cn("px-4 py-4 align-middle text-foreground sm:px-5", column.className)}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? (
        <EmptyState
          density="panel"
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          className="m-4 min-h-[220px]"
        />
      ) : null}
    </div>
  );
}
