import { HTTPSnippet, type TargetId } from "httpsnippet"
import type { Environment, Collection, Request } from "../schema"
import { mergeFolderOverrides } from "../requests/mergeFolderOverrides"
import { buildHar } from "./buildHar"
import { findCodeTarget, getCodeTarget } from "./targets"
import { CODE_TARGETS, type CodeTarget, isCodeTarget } from "./targets"

export { CODE_TARGETS, isCodeTarget, findCodeTarget, getCodeTarget }
export type { CodeTarget }

export interface GeneratedCode {
  target: CodeTarget
  code: string
}

export function generateCode(
  request: Request,
  target: CodeTarget,
  collection?: Collection,
  env?: Environment,
  interpolate?: boolean,
): GeneratedCode {
  const effective =
    collection === undefined
      ? request
      : mergeFolderOverrides(request, collection, request.id)

  if (effective.auth?.type === "aws_sigv4") {
    throw new Error(
      "codegen.generateCode: AWS SigV4 requests are not supported because generated signatures expire",
    )
  }
  if (effective.auth?.type === "ntlm") {
    throw new Error(
      "codegen.generateCode: NTLM requests are not supported because authentication requires a connection-bound challenge exchange",
    )
  }

  const { har, unhash } = buildHar(effective, env, interpolate)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snippet = new HTTPSnippet(har as any)
    const raw = snippet.convert(
      target.target as TargetId,
      target.client as string | undefined,
    )
    if (typeof raw !== "string") {
      throw new Error(
        `httpsnippet returned ${typeof raw} for ${target.target}/${target.client}`,
      )
    }
    return { target, code: unhash(raw) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`codegen.generateCode: ${message}`, { cause: e })
  }
}
