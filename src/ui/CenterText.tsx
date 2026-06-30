import type { ReactNode } from "react"

export interface WordSegment {
  text: string
  color: string
}

export function splitWords(segments: WordSegment[]): WordSegment[] {
  const words: WordSegment[] = []
  for (const seg of segments) {
    const raw = seg.text.split(/\s+/)
    for (const w of raw) {
      if (w) words.push({ text: w + " ", color: seg.color })
    }
  }
  if (words.length > 0) {
    words[words.length - 1].text = words[words.length - 1].text.trimEnd()
  }
  return words
}

export function CenterText({
  segments,
}: {
  segments: WordSegment[]
}): ReactNode {
  const words = splitWords(segments)
  return (
    <box
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {words.map((w, i) => (
        <text key={i} wrapMode="none" fg={w.color}>
          {w.text}
        </text>
      ))}
    </box>
  )
}
