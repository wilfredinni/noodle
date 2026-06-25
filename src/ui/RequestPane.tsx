import type { Request } from "../schema"
import {
  methodColor,
  formatHeaders,
  formatParams,
  formatBody,
  formatAuth,
} from "./formatRequest"

export function RequestPane({ request }: { request: Request | null }) {
  const methodFg = request ? methodColor(request.method) : ("" as string)
  const headers = request ? formatHeaders(request.headers) : []
  const params = request ? formatParams(request.params) : []
  const body = request ? formatBody(request.body) : ""
  const auth = request ? formatAuth(request.auth) : ""
  return (
    <box
      style={{
        border: true,
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
        gap: 1,
      }}
      title="Request"
    >
      {request ? (
        <>
          <text fg={methodFg}>
            {request.method} {request.url}
          </text>
          <text fg="#888">Headers</text>
          {headers.length === 0 ? (
            <text fg="#888">{"  (none)"}</text>
          ) : (
            headers.map((line) => (
              <text key={line} fg="#888">
                {"  " + line}
              </text>
            ))
          )}
          <text fg="#888">Params</text>
          {params.length === 0 ? (
            <text fg="#888">{"  (none)"}</text>
          ) : (
            params.map((line) => (
              <text key={line} fg="#888">
                {"  " + line}
              </text>
            ))
          )}
          <text fg="#888">Body</text>
          {body === "" ? (
            <text fg="#888">{"  (none)"}</text>
          ) : (
            <text>{body}</text>
          )}
          <text fg="#888">Auth</text>
          <text fg="#888">{"  " + auth}</text>
          <text fg="#888">[s] Send</text>
        </>
      ) : (
        <text fg="#888">(no request selected)</text>
      )}
    </box>
  )
}
