import { loadEnvironment } from "./load"
import type { Environment } from "../schema"

export interface Env {
  loadEnvironment(dir: string, name: string): Promise<Environment>
}

export const env: Env = { loadEnvironment }
