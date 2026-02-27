import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import * as os from "node:os";

export const supermemoryConfigSchema = Type.Object({
  baseUrl: Type.Optional(Type.String({ description: "Local Supermemory server URL" })),
  containerTag: Type.Optional(Type.String()),
  autoRecall: Type.Optional(Type.Boolean()),
  autoCapture: Type.Optional(Type.Boolean()),
  maxRecallResults: Type.Optional(Type.Number()),
  profileFrequency: Type.Optional(Type.Number()),
  captureMode: Type.Optional(Type.Union([Type.Literal("all"), Type.Literal("everything")])),
  debug: Type.Optional(Type.Boolean()),
  enableCustomContainerTags: Type.Optional(Type.Boolean()),
  customContainers: Type.Optional(Type.Array(Type.Object({
    tag: Type.String(),
    description: Type.String(),
  }))),
  customContainerInstructions: Type.Optional(Type.String()),
});

export interface SupermemoryConfig {
  baseUrl: string;
  containerTag: string;
  autoRecall: boolean;
  autoCapture: boolean;
  maxRecallResults: number;
  profileFrequency: number;
  captureMode: "all" | "everything";
  debug: boolean;
  enableCustomContainerTags: boolean;
  customContainers: Array<{ tag: string; description: string }>;
  customContainerInstructions: string;
}

export function parseConfig(pluginConfig: unknown): SupermemoryConfig {
  const cfg = (pluginConfig ?? {}) as Record<string, unknown>;
  const defaultTag = `openclaw_${os.hostname().replace(/[^a-zA-Z0-9_]/g, "_")}`;

  return {
    baseUrl: (cfg.baseUrl as string) ?? "http://localhost:3456",
    containerTag: (cfg.containerTag as string) ?? defaultTag,
    autoRecall: (cfg.autoRecall as boolean) ?? true,
    autoCapture: (cfg.autoCapture as boolean) ?? true,
    maxRecallResults: (cfg.maxRecallResults as number) ?? 10,
    profileFrequency: (cfg.profileFrequency as number) ?? 50,
    captureMode: (cfg.captureMode as "all" | "everything") ?? "all",
    debug: (cfg.debug as boolean) ?? false,
    enableCustomContainerTags: (cfg.enableCustomContainerTags as boolean) ?? false,
    customContainers: (cfg.customContainers as Array<{ tag: string; description: string }>) ?? [],
    customContainerInstructions: (cfg.customContainerInstructions as string) ?? "",
  };
}