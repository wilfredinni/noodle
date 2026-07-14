export interface CommandResult<T> {
  data: T
  failed?: boolean
}

export async function emitCommand<T>(
  json: boolean,
  action: () => Promise<CommandResult<T>>,
): Promise<void> {
  try {
    const result = await action()
    const status = result.failed ? "error" : "success"
    if (json)
      process.stdout.write(
        `${JSON.stringify({ status, data: result.data, errors: result.failed ? ["command failed"] : [] })}\n`,
      )
    else
      process.stdout.write(
        `${result.failed ? "error: " : ""}${JSON.stringify(result.data, null, 2)}\n`,
      )
    if (result.failed) process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (json)
      process.stdout.write(
        `${JSON.stringify({ status: "error", data: null, errors: [message] })}\n`,
      )
    else process.stderr.write(`error: ${message}\n`)
    process.exitCode = 1
  }
}
