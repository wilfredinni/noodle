export function nextIndex(
  current: number,
  length: number,
  delta: number,
): number {
  if (length <= 0) return -1
  const next = current + delta
  if (next < 0) return 0
  if (next > length - 1) return length - 1
  return next
}
