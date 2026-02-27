import { Type } from "@sinclair/typebox"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { LocalSupermemoryClient } from "../client.ts"
import type { SupermemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function registerForgetTool(
	api: OpenClawPluginApi,
	client: LocalSupermemoryClient,
	_cfg: SupermemoryConfig,
): void {
	api.registerTool(
		{
			name: "supermemory_forget",
			label: "Memory Forget",
			description: "Delete a memory by query or ID.",
			parameters: Type.Object({
				query: Type.Optional(Type.String({ description: "Search query to find memory to forget" })),
				id: Type.Optional(Type.String({ description: "Specific memory ID to forget" })),
				containerTag: Type.Optional(Type.String({ description: "Optional container tag" })),
			}),
			async execute(
				_toolCallId: string,
				params: { query?: string; id?: string; containerTag?: string },
			) {
				log.debug(`forget tool: query="${params.query}" id="${params.id}"`)

				if (params.id) {
					const result = await client.deleteMemory(params.id, params.containerTag)
					return {
						content: [{ type: "text" as const, text: result.forgotten ? `Forgot memory ${params.id}` : "Memory not found" }],
					}
				}

				if (params.query) {
					const result = await client.forgetByQuery(params.query, params.containerTag)
					return {
						content: [{ type: "text" as const, text: result.message }],
					}
				}

				return {
					content: [{ type: "text" as const, text: "Provide either a query or an ID to forget." }],
				}
			},
		},
		{ name: "supermemory_forget" },
	)
}