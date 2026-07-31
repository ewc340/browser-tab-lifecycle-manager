/**
 * Pure restore-target selection for recovery records.
 */
export function selectRestoreWindowId(
  originalWindowId: number | undefined,
  openNormalWindowIds: readonly number[],
  fallbackWindowId: number | undefined,
): number | undefined {
  if (
    originalWindowId !== undefined &&
    openNormalWindowIds.includes(originalWindowId)
  ) {
    return originalWindowId;
  }
  if (fallbackWindowId !== undefined && openNormalWindowIds.includes(fallbackWindowId)) {
    return fallbackWindowId;
  }
  return openNormalWindowIds[0];
}

export function clampRestoreIndex(
  requestedIndex: number | undefined,
  tabCount: number,
): number {
  if (requestedIndex === undefined || requestedIndex < 0) return tabCount;
  return Math.min(requestedIndex, tabCount);
}
