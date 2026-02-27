import { Type } from "@sinclair/typebox"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { LocalSupermemoryClient } from "../client.ts"
import type { SupermemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function registerSearchTool(
	api: OpenClawPluginApi,
	client: LocalSupermemoryClient,
	_cfg: SupermemoryConfig,
): void {
	api.registerTool(
		{
			name: "supermemory_search",
			label: "Memory Search",
			description: "Search memories by query. Returns relevant stored information.",
			parameters: Type.Object({
				query: Type.String({ description: "Search query" }),
				limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
				containerTag: Type.Optional(Type.String({ description: "Optional container tag" })),
			}),
			async execute(
				_toolCallId: string,
				params: { query: string; limit?: number; containerTag?: string },
			) {
				log.debug(`search tool: query="${params.query}" limit=${params.limit ?? 5}`)

				const results = await client.search(params.query, params.limit ?? 5, params.containerTag)

				if (results.length === 0) {
					return {
						content: [{ type: "text" as const, text: "No memories found." }],
					}
				}

				const lines = results.map((r, i) => {
					const score = r.similarity ? ` [${(r.similarity * 100).toFixed(0)}%]` : ""
					return `${i + 1}. ${r.content || r.memory || ""}${score}`
				})

				return {
					content: [{ type: "text" as const, text: `Found ${results.length} memories:\n\n${lines.join("\n")}` }],
				}
			},
		},
		{ name: "supermemory_search" },
	)
}