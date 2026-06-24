import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "../ui/App"

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)
