import type { Environment } from "../schema"

export async function loadEnvironment(
  _dir: string,
  _name: string,
): Promise<Environment> {
  throw new Error("env.load: not implemented")
}
