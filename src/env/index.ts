import { loadEnvironment } from "./load"
import { listEnvironments } from "./list"
import type { Environment } from "../schema"

export interface Env {
  loadEnvironment(dir: string, name: string): Promise<Environment>
  listEnvironments(dir: string): Promise<string[]>
}

export const env: Env = {
  loadEnvironment,
  listEnvironments,
}
