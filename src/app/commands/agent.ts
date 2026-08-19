import { defineCommand } from "citty"
import {
  installNoodleSkill,
  type AgentSkillInstallResult,
} from "../../agentSkill"
import { emitCommand } from "../commandResult"

const install = defineCommand({
  meta: {
    name: "install",
    description: "Install or update the Noodle agent skill",
  },
  args: {
    json: {
      type: "boolean",
      default: false,
      description: "Write one JSON result envelope to stdout",
    },
    force: {
      type: "boolean",
      default: false,
      description: "Replace all detected unmanaged skill paths",
    },
  },
  async run({ args }) {
    await emitCommand(
      args.json === true,
      async () => ({ data: await installNoodleSkill(undefined, args.force) }),
      formatInstall,
    )
  },
})

function formatInstall(result: AgentSkillInstallResult): string {
  const action = result.action === "installed" ? "Installed" : "Updated"
  const links = result.linked.length
    ? `\nLinked: ${result.linked.join(", ")}`
    : ""
  return `${action} Noodle skill at ${result.path}${links}`
}

export default defineCommand({
  meta: {
    name: "agent",
    description: "Manage Noodle agent integrations",
  },
  subCommands: { install },
})
