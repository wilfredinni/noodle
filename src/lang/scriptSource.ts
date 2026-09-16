export function isExternalScriptSource(source: string): boolean {
  const literal = source.trim()
  return (
    /^[\w.@~\\/-]+\.(?:[cm]?js|ts)$/.test(literal) ||
    (/^(?:file:\/\/|\.{1,2}[\\/]|[~@][\\/]|[a-zA-Z]:[\\/]|\\|\/(?![/*]))[^\r\n;{}()'"`]+$/.test(
      literal,
    ) &&
      !/^\/.*\/[dgimsuvy]*$/.test(literal))
  )
}
