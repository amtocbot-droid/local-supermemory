/**
 * Local Supermemory Client
 * 
 * A client that connects to the local Supermemory server instead of the cloud API.
 */

import { log } from "./logger.ts";

export type SearchResult = {
  id: string;
  content: string;
  memory?: string;
  similarity?: number;
  metadata?: Record<string, unknown>;
};

export type ProfileSearchResult = {
  memory?: string;
  updatedAt?: string;
  similarity?: number;
  [key: string]: unknown;
};

export type ProfileResult = {
  static: string[];
  dynamic: string[];
  searchResults: ProfileSearchResult[];
};

export class LocalSupermemoryClient {
  private baseUrl: string;
  private containerTag: string;

  constructor(baseUrl: string, containerTag: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.containerTag = containerTag;
    log.info(`initialized local client (container: ${containerTag}, url: ${this.baseUrl})`);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Local Supermemory API error: ${response.status} ${text}`);
    }

    return response.json();
  }

  async addMemory(
    content: string,
    metadata?: Record<string, string | number | boolean>,
    customId?: string,
    containerTag?: string,
  ): Promise<{ id: string }> {
    const tag = containerTag ?? this.containerTag;

    log.debugRequest("add", {
      contentLength: content.length,
      customId,
      metadata,
      containerTag: tag,
    });

    const result = await this.request('POST', '/api/v1/add', {
      content,
      containerTag: tag,
      metadata,
      customId,
    }) as { id: string };

    log.debugResponse("add", { id: result.id });
    return result;
  }

  async search(
    query: string,
    limit = 5,
    containerTag?: string,
  ): Promise<SearchResult[]> {
    const tag = containerTag ?? this.containerTag;

    log.debugRequest("search.memories", {
      query,
      limit,
      containerTag: tag,
    });

    const response = await this.request('POST', '/api/v1/search/memories', {
      q: query,
      containerTag: tag,
      limit,
    }) as { results: Array<{ id: string; memory?: string; similarity?: number; metadata?: Record<string, unknown> }> };

    const results: SearchResult[] = (response.results ?? []).map((r) => ({
      id: r.id,
      content: r.memory ?? "",
      memory: r.memory,
      similarity: r.similarity,
      metadata: r.metadata ?? undefined,
    }));

    log.debugResponse("search.memories", { count: results.length });
    return results;
  }

  async getProfile(
    query?: string,
    containerTag?: string,
  ): Promise<ProfileResult> {
    const tag = containerTag ?? this.containerTag;

    log.debugRequest("profile", { containerTag: tag, query });

    const params = new URLSearchParams({ containerTag: tag });
    if (query) params.set('q', query);

    const response = await this.request('GET', `/api/v1/profile?${params}`) as {
      profile?: { static?: string[]; dynamic?: string[] };
      searchResults?: { results?: ProfileSearchResult[] };
    };

    log.debugResponse("profile.raw", response);

    const result: ProfileResult = {
      static: response.profile?.static ?? [],
      dynamic: response.profile?.dynamic ?? [],
      searchResults: (response.searchResults?.results ?? []) as ProfileSearchResult[],
    };

    log.debugResponse("profile", {
      staticCount: result.static.length,
      dynamicCount: result.dynamic.length,
      searchCount: result.searchResults.length,
    });
    return result;
  }

  async deleteMemory(
    id: string,
    containerTag?: string,
  ): Promise<{ id: string; forgotten: boolean }> {
    const tag = containerTag ?? this.containerTag;

    log.debugRequest("memories.delete", {
      id,
      containerTag: tag,
    });

    const result = await this.request('POST', '/api/v1/memories/forget', {
      containerTag: tag,
      id,
    }) as { id: string; forgotten: boolean };

    log.debugResponse("memories.delete", result);
    return result;
  }

  async forgetByQuery(
    query: string,
    containerTag?: string,
  ): Promise<{ success: boolean; message: string }> {
    log.debugRequest("forgetByQuery", { query, containerTag });

    const results = await this.search(query, 5, containerTag);
    if (results.length === 0) {
      return { success: false, message: "No matching memory found to forget." };
    }

    const target = results[0];
    await this.deleteMemory(target.id, containerTag);

    const preview = (target.content || target.memory || "").slice(0, 100);
    return { success: true, message: `Forgot: "${preview}"` };
  }

  async wipeAllMemories(): Promise<{ deletedCount: number }> {
    log.debugRequest("wipe", { containerTag: this.containerTag });

    // Get all document IDs
    const response = await this.request('POST', '/api/v1/documents/list', {
      containerTags: [this.containerTag],
      limit: 1000,
    }) as { memories: Array<{ id: string }> };

    const ids = (response.memories ?? []).map(m => m.id);

    if (ids.length === 0) {
      log.debug("wipe: no documents found");
      return { deletedCount: 0 };
    }

    log.debug(`wipe: found ${ids.length} documents, deleting`);

    // Bulk delete
    await this.request('POST', '/api/v1/documents/deleteBulk', { ids });

    log.debugResponse("wipe", { deletedCount: ids.length });
    return { deletedCount: ids.length };
  }

  getContainerTag(): string {
    return this.containerTag;
  }
}