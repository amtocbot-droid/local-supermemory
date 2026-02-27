import Supermemory from "supermemory"
import {
	getRequestIntegrity,
	sanitizeContent,
	validateApiKeyFormat,
	validateContainerTag,
} from "./lib/validate.js"
import { log } from "./logger.ts"

export type SearchResult = {
	id: string
	content: string
	memory?: string
	similarity?: number
	metadata?: Record<string, unknown>
}

export type ProfileSearchResult = {
	memory?: string
	updatedAt?: string
	similarity?: number
	[key: string]: unknown
}

export type ProfileResult = {
	static: string[]
	dynamic: string[]
	searchResults: ProfileSearchResult[]
}

function limitText(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text
}

// Local client for self-hosted Supermemory - matches cloud SDK interface
class LocalSupermemoryClient {
	private baseUrl: string
	private containerTag: string

	// Cloud SDK compatible interface
	search = {
		memories: async (params: { q: string; containerTag: string; limit: number }): Promise<{ results: any[] }> => {
			const response = await fetch(`${this.baseUrl}/api/v1/search/memories`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			})
			return await response.json()
		}
	}

	memories = {
		forget: async (params: { id: string; containerTag: string }): Promise<{ id: string; forgotten: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/v1/memories/forget`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			})
			return await response.json()
		}
	}

	documents = {
		list: async (params: { containerTags: string[]; limit: number; page: number }): Promise<{ memories: any[]; pagination?: { totalPages: number } }> => {
			const response = await fetch(`${this.baseUrl}/api/v1/documents/list`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			})
			return await response.json()
		},
		deleteBulk: async (params: { ids: string[] }): Promise<void> => {
			await fetch(`${this.baseUrl}/api/v1/documents/deleteBulk`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			})
		}
	}

	constructor(baseUrl: string, containerTag: string) {
		this.baseUrl = baseUrl.replace(/\/$/, "")
		this.containerTag = containerTag
		log.info(`local client initialized (container: ${containerTag}, url: ${baseUrl})`)
	}

	async add(params: { content: string; containerTag: string; metadata?: any; customId?: string }): Promise<{ id: string }> {
		const response = await fetch(`${this.baseUrl}/api/v1/add`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(params),
		})
		const result = await response.json()
		return { id: result.id }
	}

	async profile(params: { containerTag: string; q?: string }): Promise<{ profile?: { static: string[]; dynamic: string[] }; searchResults?: { results: any[] } }> {
		const url = new URL(`${this.baseUrl}/api/v1/profile`)
		url.searchParams.set("containerTag", params.containerTag)
		if (params.q) url.searchParams.set("q", params.q)
		const response = await fetch(url.toString())
		return await response.json()
	}

	getContainerTag(): string {
		return this.containerTag
	}
}

export class SupermemoryClient {
	private client: Supermemory | LocalSupermemoryClient
	private containerTag: string

	constructor(apiKey: string, containerTag: string, baseUrl?: string) {
		const tagCheck = validateContainerTag(containerTag)
		if (!tagCheck.valid) {
			log.warn(`container tag warning: ${tagCheck.reason}`)
		}

		this.containerTag = containerTag

		// Use local client if baseUrl is provided
		if (baseUrl) {
			this.client = new LocalSupermemoryClient(baseUrl, containerTag)
			log.info(`using local supermemory at ${baseUrl}`)
		} else {
			const keyCheck = validateApiKeyFormat(apiKey)
			if (!keyCheck.valid) {
				throw new Error(`invalid API key: ${keyCheck.reason}`)
			}
			const integrityHeaders = getRequestIntegrity(apiKey, containerTag)
			this.client = new Supermemory({
				apiKey,
				defaultHeaders: integrityHeaders,
			})
			log.info(`initialized (container: ${containerTag})`)
		}
	}

	async addMemory(
		content: string,
		metadata?: Record<string, string | number | boolean>,
		customId?: string,
		containerTag?: string,
	): Promise<{ id: string }> {
		const cleaned = sanitizeContent(content)
		const tag = containerTag ?? this.containerTag

		log.debugRequest("add", {
			contentLength: cleaned.length,
			customId,
			metadata,
			containerTag: tag,
		})

		const result = await this.client.add({
			content: cleaned,
			containerTag: tag,
			...(metadata && { metadata }),
			...(customId && { customId }),
		})

		log.debugResponse("add", { id: result.id })
		return { id: result.id }
	}

	async search(
		query: string,
		limit = 5,
		containerTag?: string,
	): Promise<SearchResult[]> {
		const tag = containerTag ?? this.containerTag

		log.debugRequest("search.memories", {
			query,
			limit,
			containerTag: tag,
		})

		const response = await this.client.search.memories({
			q: query,
			containerTag: tag,
			limit,
		})

		const results: SearchResult[] = (response.results ?? []).map((r) => ({
			id: r.id,
			content: r.memory ?? "",
			memory: r.memory,
			similarity: r.similarity,
			metadata: r.metadata ?? undefined,
		}))

		log.debugResponse("search.memories", { count: results.length })
		return results
	}

	async getProfile(
		query?: string,
		containerTag?: string,
	): Promise<ProfileResult> {
		const tag = containerTag ?? this.containerTag

		log.debugRequest("profile", { containerTag: tag, query })

		const response = await this.client.profile({
			containerTag: tag,
			...(query && { q: query }),
		})

		log.debugResponse("profile.raw", response)

		const result: ProfileResult = {
			static: response.profile?.static ?? [],
			dynamic: response.profile?.dynamic ?? [],
			searchResults: (response.searchResults?.results ??
				[]) as ProfileSearchResult[],
		}

		log.debugResponse("profile", {
			staticCount: result.static.length,
			dynamicCount: result.dynamic.length,
			searchCount: result.searchResults.length,
		})
		return result
	}

	async deleteMemory(
		id: string,
		containerTag?: string,
	): Promise<{ id: string; forgotten: boolean }> {
		const tag = containerTag ?? this.containerTag

		log.debugRequest("memories.delete", {
			id,
			containerTag: tag,
		})
		const result = await this.client.memories.forget({
			containerTag: tag,
			id,
		})
		log.debugResponse("memories.delete", result)
		return result
	}

	async forgetByQuery(
		query: string,
		containerTag?: string,
	): Promise<{ success: boolean; message: string }> {
		log.debugRequest("forgetByQuery", { query, containerTag })

		const results = await this.search(query, 5, containerTag)
		if (results.length === 0) {
			return { success: false, message: "No matching memory found to forget." }
		}

		const target = results[0]
		await this.deleteMemory(target.id, containerTag)

		const preview = limitText(target.content || target.memory || "", 100)
		return { success: true, message: `Forgot: "${preview}"` }
	}

	async wipeAllMemories(): Promise<{ deletedCount: number }> {
		log.debugRequest("wipe", { containerTag: this.containerTag })

		const allIds: string[] = []
		let page = 1

		while (true) {
			const response = await this.client.documents.list({
				containerTags: [this.containerTag],
				limit: 100,
				page,
			})

			if (!response.memories || response.memories.length === 0) break

			for (const doc of response.memories) {
				if (doc.id) allIds.push(doc.id)
			}

			if (
				!response.pagination?.totalPages ||
				page >= response.pagination.totalPages
			)
				break
			page++
		}

		if (allIds.length === 0) {
			log.debug("wipe: no documents found")
			return { deletedCount: 0 }
		}

		log.debug(`wipe: found ${allIds.length} documents, deleting in batches`)

		let deletedCount = 0
		for (let i = 0; i < allIds.length; i += 100) {
			const batch = allIds.slice(i, i + 100)
			await this.client.documents.deleteBulk({ ids: batch })
			deletedCount += batch.length
		}

		log.debugResponse("wipe", { deletedCount })
		return { deletedCount }
	}

	getContainerTag(): string {
		return this.containerTag
	}
}
