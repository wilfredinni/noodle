export function buildCharToDisplayOffsets(content: string): number[] {
  const offsets = new Array<number>(content.length + 1)
  let displayOffset = 0

  for (let index = 0; index < content.length; ) {
    offsets[index] = displayOffset
    const codePoint = content.codePointAt(index)
    if (codePoint === undefined) break

    const width = codePoint > 0xffff ? 2 : 1
    for (let unit = 1; unit < width; unit++) {
      offsets[index + unit] = displayOffset
    }

    index += width
    if (codePoint !== 0x0a && codePoint !== 0x0d) displayOffset++
  }

  offsets[content.length] = displayOffset
  return offsets
}

export function charOffsetToDisplayOffset(
  offsets: number[],
  offset: number,
): number {
  const clamped = Math.max(0, Math.min(offset, offsets.length - 1))
  return offsets[clamped] ?? offsets[offsets.length - 1] ?? 0
}
