import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { LocalSupermemoryClient } from "./client.ts"
import { registerCommands, registerStubCommands } from "./commands/slash.ts"
import { parseConfig, supermemoryConfigSchema } from "./config.ts"
import { buildCaptureHandler } from "./hooks/capture.ts"
import { buildRecallHandler } from "./hooks/recall.ts"
import { initLogger } from "./logger.ts"
import { registerForgetTool } from "./tools/forget.ts"
import { registerProfileTool } from "./tools/profile.ts"
import { registerSearchTool } from "./tools/search.ts"
import { registerStoreTool } from "./tools/store.ts"

export default {
	id: "openclaw-local-supermemory",
	name: "Local Supermemory",
	description: "Local Supermemory plugin for OpenClaw - no cloud required",
	kind: "memory" as const,
	configSchema: supermemoryConfigSchema,

	register(api: OpenClawPluginApi) {
		const cfg = parseConfig(api.pluginConfig)

		initLogger(api.logger, cfg.debug)

		// Check if local server is reachable
		fetch(`${cfg.baseUrl}/health`)
			.then((res) => res.json())
			.then((data) => {
				if ((data as { status?: string }).status === "ok") {
					api.logger.info(`local-supermemory: server connected (${cfg.baseUrl})`)
				}
			})
			.catch(() => {
				api.logger.warn(
					`local-supermemory: cannot reach server at ${cfg.baseUrl}. Start it with: cd ~/local-supermemory && npm start`,
				)
			})

		const client = new LocalSupermemoryClient(cfg.baseUrl, cfg.containerTag)

		let sessionKey: string | undefined
		const getSessionKey = () => sessionKey

		registerSearchTool(api, client, cfg)
		registerStoreTool(api, client, cfg, getSessionKey)
		registerForgetTool(api, client, cfg)
		registerProfileTool(api, client, cfg)

		if (cfg.autoRecall) {
			const recallHandler = buildRecallHandler(client, cfg)
			api.on(
				"before_agent_start",
				(event: Record<string, unknown>, ctx: Record<string, unknown>) => {
					if (ctx.sessionKey) sessionKey = ctx.sessionKey as string
					return recallHandler(event, ctx)
				},
			)
		}

		if (cfg.autoCapture) {
			api.on("agent_end", buildCaptureHandler(client, cfg, getSessionKey))
		}

		registerCommands(api, client, cfg, getSessionKey)

		api.registerService({
			id: "openclaw-local-supermemory",
			start: () => {
				api.logger.info("local-supermemory: service started")
			},
			stop: () => {
				api.logger.info("local-supermemory: service stopped")
			},
		})
	},
}