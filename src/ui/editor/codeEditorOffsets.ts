export function buildByteToDisplayOffsets(content: string): number[] {
  const offsets: number[] = []
  offsets[0] = 0
  let displayOffset = 0
  let byteOffset = 0

  for (const char of content) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) continue
    byteOffset += utf8ByteLength(codePoint)
    if (char !== "\n") displayOffset++
    offsets[byteOffset] = displayOffset
  }

  return offsets
}

export function byteOffsetToDisplayOffset(
  offsets: number[],
  byteOffset: number,
): number {
  if (byteOffset <= 0) return 0
  for (let i = byteOffset; i >= 0; i--) {
    const value = offsets[i]
    if (value !== undefined) return value
  }
  return 0
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}
