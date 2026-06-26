import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("pi-composio loaded", "info");
  });

  pi.registerTool({
    name: "composio_search",
    label: "Composio Search",
    description:
      "Search Composio's 1,000+ app tools by describing what you want to do. Returns matching tools with their schemas and connection status.",
    parameters: Type.Object({
      task: Type.String({ description: "What you want to do, e.g. 'send an email'" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text" as const, text: `Searching for: ${params.task}` }],
        details: {},
      };
    },
  });
}
