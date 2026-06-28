import { useCallback, useRef, type KeyboardEvent } from "react";

export type UseRovingTabIndexOptions<TId extends string> = {
  itemIds: readonly TId[];
  activeId: TId | null;
  onActivate: (id: TId) => void;
  itemSelector?: (id: TId) => string;
};

/**
 * Roving tabindex for horizontal tablists: active item is tabbable (0), others -1.
 * ArrowLeft/Right, Home, and End move selection and focus within the list.
 */
export function useRovingTabIndex<TId extends string>({
  itemIds,
  activeId,
  onActivate,
  itemSelector = (id) => `[data-roving-tab="${id}"]`,
}: UseRovingTabIndexOptions<TId>) {
  const listRef = useRef<HTMLDivElement>(null);

  const getTabIndex = useCallback((id: TId) => (activeId === id ? 0 : -1), [activeId]);

  const focusItem = useCallback(
    (id: TId) => {
      listRef.current?.querySelector<HTMLElement>(itemSelector(id))?.focus();
    },
    [itemSelector],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!itemIds.length) return;

      const currentIndex = activeId ? itemIds.indexOf(activeId) : 0;
      const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;

      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowRight":
          nextIndex = (resolvedIndex + 1) % itemIds.length;
          break;
        case "ArrowLeft":
          nextIndex = (resolvedIndex - 1 + itemIds.length) % itemIds.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = itemIds.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextId = itemIds[nextIndex];
      if (!nextId) return;
      onActivate(nextId);
      focusItem(nextId);
    },
    [itemIds, activeId, onActivate, focusItem],
  );

  return { listRef, getTabIndex, handleKeyDown, focusItem };
}
