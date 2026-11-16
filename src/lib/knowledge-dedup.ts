/** Keep the first new entry for each content key in a batch. */
export function retainFirstUnique<T extends { content: string }>(
  rows: readonly T[],
  known: Set<string>,
  contentKey: (content: string) => string = (content) => content,
): T[] {
  return rows.filter((row) => {
    const key = contentKey(row.content);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
}
