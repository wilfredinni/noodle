export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "")
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t,
  )
}

export function interpolateGradient(stops: string[], t: number): string {
  if (stops.length === 0) return "#000000"
  if (stops.length === 1) return stops[0]
  if (t <= 0) return stops[0]
  if (t >= 1) return stops[stops.length - 1]

  const segment = t * (stops.length - 1)
  const i = Math.floor(segment)
  const localT = segment - i
  return lerpColor(stops[i], stops[i + 1], localT)
}
