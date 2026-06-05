/** Keep the newest artifact when the same name + type was regenerated in-thread. */
export function dedupeDirectorArtifacts<
  T extends { name: string; artifactType: string; createdAt: Date },
>(artifacts: T[]): T[] {
  const seen = new Map<string, T>();
  for (const artifact of artifacts) {
    const key = `${artifact.artifactType}::${artifact.name.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || artifact.createdAt > existing.createdAt) {
      seen.set(key, artifact);
    }
  }
  return [...seen.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
