import { Type } from "@sinclair/typebox"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { LocalSupermemoryClient } from "../client.ts"
import type { SupermemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function registerProfileTool(
	api: OpenClawPluginApi,
	client: LocalSupermemoryClient,
	_cfg: SupermemoryConfig,
): void {
	api.registerTool(
		{
			name: "supermemory_profile",
			label: "Memory Profile",
			description: "View user profile (persistent facts + recent context).",
			parameters: Type.Object({
				query: Type.Optional(Type.String({ description: "Optional query to focus profile search" })),
				containerTag: Type.Optional(Type.String({ description: "Optional container tag" })),
			}),
			async execute(
				_toolCallId: string,
				params: { query?: string; containerTag?: string },
			) {
				log.debug(`profile tool: query="${params.query}"`)

				const profile = await client.getProfile(params.query, params.containerTag)

				const parts: string[] = []

				if (profile.static.length > 0) {
					parts.push("## Persistent Facts\n" + profile.static.map(f => `- ${f}`).join("\n"))
				}

				if (profile.dynamic.length > 0) {
					parts.push("## Recent Context\n" + profile.dynamic.map(f => `- ${f}`).join("\n"))
				}

				if (profile.searchResults.length > 0) {
					const searchLines = profile.searchResults.map(r => {
						const score = r.similarity ? ` [${(r.similarity * 100).toFixed(0)}%]` : ""
						return `- ${r.memory || ""}${score}`
					})
					parts.push("## Relevant Memories\n" + searchLines.join("\n"))
				}

				if (parts.length === 0) {
					return {
						content: [{ type: "text" as const, text: "No profile information available yet." }],
					}
				}

				return {
					content: [{ type: "text" as const, text: parts.join("\n\n") }],
				}
			},
		},
		{ name: "supermemory_profile" },
	)
}