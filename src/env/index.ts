import { loadEnvironment, type LoadEnvironmentOptions } from "./load"
import { listEnvironments } from "./list"
import { saveEnvironment, type SaveEnvironmentOptions } from "./save"
import { deleteEnvironment } from "./delete"
import { cloneEnvironment } from "./clone"
import type { Environment } from "../schema"

export interface Env {
  loadEnvironment(
    dir: string,
    name: string,
    options?: LoadEnvironmentOptions,
  ): Promise<Environment>
  listEnvironments(dir: string): Promise<string[]>
  saveEnvironment(
    dir: string,
    env: Environment,
    options?: SaveEnvironmentOptions,
  ): Promise<void>
  deleteEnvironment(dir: string, name: string): Promise<void>
  cloneEnvironment(dir: string, source: string, target: string): Promise<void>
}

export const env: Env = {
  loadEnvironment,
  listEnvironments,
  saveEnvironment,
  deleteEnvironment,
  cloneEnvironment,
}
