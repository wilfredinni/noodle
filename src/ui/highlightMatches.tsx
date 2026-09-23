export function highlightMatches(text: string, query: string, color: string) {
  if (!query) return text
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts = []
  let offset = 0
  for (
    let index = lower.indexOf(needle);
    index !== -1;
    index = lower.indexOf(needle, offset)
  ) {
    parts.push(<span key={`plain-${offset}`}>{text.slice(offset, index)}</span>)
    parts.push(
      <span key={`match-${index}`} fg={color}>
        <b>
          <u>{text.slice(index, index + needle.length)}</u>
        </b>
      </span>,
    )
    offset = index + needle.length
  }
  parts.push(<span key="tail">{text.slice(offset)}</span>)
  return parts
}
