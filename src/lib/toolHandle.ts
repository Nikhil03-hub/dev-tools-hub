import type { Command } from "../components/CommandPalette";

// Every hub tool (JSON Workbench, JWT Decoder, …) exposes its current
// command list through this tiny imperative handle instead of pushing
// state up to the hub shell. The hub only ever *pulls* getCommands() at
// the moment it needs to render the palette (open, or switching tools),
// so there's no render → setState → render feedback loop between a tool
// and the shell that owns it.
export interface ToolHandle {
  getCommands: () => Command[];
}
