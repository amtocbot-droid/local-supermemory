#!/usr/bin/env node

/**
 * Local Supermemory Clone
 * 
 * A local implementation of the Supermemory API for OpenClaw.
 * Implements: add, search.memories, profile, memories.forget, documents.list, documents.deleteBulk
 * 
 * Uses SQLite for persistent storage and TF-IDF for semantic search.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const app = express();
const PORT = process.env.LOCAL_SUPERMEMORY_PORT || 3456;
const DATA_DIR = process.env.LOCAL_SUPERMEMORY_DATA_DIR || path.join(os.homedir(), '.local-supermemory');
const DB_PATH = path.join(DATA_DIR, 'memories.db');

// Ensure data directory exists
import fs from 'fs';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    container_tag TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    custom_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    forgotten_at TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_container_tag ON memories(container_tag);
  CREATE INDEX IF NOT EXISTS idx_custom_id ON memories(custom_id);
  CREATE INDEX IF NOT EXISTS idx_forgotten ON memories(forgotten_at);
  
  CREATE TABLE IF NOT EXISTS profile_facts (
    id TEXT PRIMARY KEY,
    container_tag TEXT NOT NULL,
    fact TEXT NOT NULL,
    fact_type TEXT DEFAULT 'dynamic',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_profile_container ON profile_facts(container_tag);
  CREATE INDEX IF NOT EXISTS idx_profile_type ON profile_facts(fact_type);
`);

// Middleware
app.use(express.json({ limit: '10mb' }));

// Simple token-based auth (accept any token starting with 'sm_local')
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  // For local use, we're lenient - accept any auth or no auth
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============ Helper Functions ============

function generateId() {
  return uuidv4();
}

function simpleHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}

// TF-IDF style text similarity
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function computeSimilarity(query, content) {
  const queryTokens = new Set(tokenize(query));
  const contentTokens = tokenize(content);
  
  if (queryTokens.size === 0 || contentTokens.length === 0) return 0;
  
  let matches = 0;
  for (const token of contentTokens) {
    if (queryTokens.has(token)) matches++;
  }
  
  // Jaccard-like similarity with boost for exact phrase matches
  const baseScore = matches / Math.sqrt(queryTokens.size * contentTokens.length);
  const exactBoost = content.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;
  
  return Math.min(1, baseScore + exactBoost);
}

// Extract key facts from content for profile building
function extractFacts(content, containerTag) {
  const facts = [];
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  // Look for preference-like statements
  const preferencePatterns = [
    /i (?:prefer|like|love|want|need|use)/i,
    /my (?:favorite|preferred|default)/i,
    /i (?:always|never|usually|often)/i,
    /remember (?:that|to)/i,
  ];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    for (const pattern of preferencePatterns) {
      if (pattern.test(trimmed)) {
        facts.push(trimmed);
        break;
      }
    }
  }
  
  return facts;
}

// ============ API Endpoints ============

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0-local' });
});

// Add document/memory
app.post('/api/v1/add', (req, res) => {
  try {
    const { content, containerTag, containerTags, metadata, customId } = req.body;
    const tag = containerTag || containerTags?.[0] || 'default';
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const id = generateId();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO memories (id, container_tag, content, metadata, custom_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      tag,
      content,
      metadata ? JSON.stringify(metadata) : null,
      customId || null,
      now,
      now
    );
    
    // Extract and store profile facts
    const facts = extractFacts(content, tag);
    const factStmt = db.prepare(`
      INSERT INTO profile_facts (id, container_tag, fact, fact_type, created_at, updated_at)
      VALUES (?, ?, ?, 'dynamic', ?, ?)
    `);
    
    for (const fact of facts) {
      factStmt.run(generateId(), tag, fact, now, now);
    }
    
    console.log(`  → Added memory ${id} to container ${tag}`);
    
    res.json({ id, created: true });
  } catch (error) {
    console.error('Add error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search memories (low latency for conversational)
app.post('/api/v1/search/memories', (req, res) => {
  try {
    const { q, query, containerTag, containerTags, limit = 10 } = req.body;
    const searchQuery = q || query;
    const tag = containerTag || containerTags?.[0] || 'default';
    
    if (!searchQuery) {
      return res.json({ results: [], timing: 0, total: 0 });
    }
    
    const startTime = Date.now();
    
    // Get all non-forgotten memories for this container
    const stmt = db.prepare(`
      SELECT id, content, metadata, created_at, updated_at
      FROM memories
      WHERE container_tag = ? AND forgotten_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1000
    `);
    
    const memories = stmt.all(tag);
    
    // Compute similarities
    const results = memories
      .map(m => ({
        id: m.id,
        memory: m.content,
        similarity: computeSimilarity(searchQuery, m.content),
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }))
      .filter(r => r.similarity > 0.05)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    const timing = Date.now() - startTime;
    
    console.log(`  → Search found ${results.length} results (${timing}ms)`);
    
    res.json({ results, timing, total: results.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get profile
app.get('/api/v1/profile', (req, res) => {
  try {
    const { containerTag, q, threshold = 0.1 } = req.query;
    const tag = containerTag || 'default';
    
    // Get static facts (older, more established preferences)
    const staticStmt = db.prepare(`
      SELECT DISTINCT fact FROM profile_facts
      WHERE container_tag = ? AND fact_type = 'static'
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    const staticFacts = staticStmt.all(tag).map(r => r.fact);
    
    // Get dynamic facts (recent context)
    const dynamicStmt = db.prepare(`
      SELECT DISTINCT fact FROM profile_facts
      WHERE container_tag = ? AND fact_type = 'dynamic'
      ORDER BY updated_at DESC
      LIMIT 30
    `);
    const dynamicFacts = dynamicStmt.all(tag).map(r => r.fact);
    
    // If query provided, also search memories
    let searchResults = { results: [], timing: 0, total: 0 };
    if (q) {
      const memStmt = db.prepare(`
        SELECT id, content, created_at, updated_at
        FROM memories
        WHERE container_tag = ? AND forgotten_at IS NULL
        ORDER BY created_at DESC
        LIMIT 500
      `);
      const memories = memStmt.all(tag);
      
      const results = memories
        .map(m => ({
          memory: m.content,
          similarity: computeSimilarity(q, m.content),
          updatedAt: m.updated_at
        }))
        .filter(r => r.similarity > parseFloat(threshold))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);
      
      searchResults = { results, timing: 0, total: results.length };
    }
    
    console.log(`  → Profile: ${staticFacts.length} static, ${dynamicFacts.length} dynamic facts`);
    
    res.json({
      profile: {
        static: staticFacts,
        dynamic: dynamicFacts
      },
      searchResults: searchResults.total > 0 ? searchResults : undefined
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Forget memory
app.post('/api/v1/memories/forget', (req, res) => {
  try {
    const { containerTag, id, content } = req.body;
    
    if (id) {
      // Forget by ID
      const stmt = db.prepare(`
        UPDATE memories SET forgotten_at = ? WHERE id = ? AND container_tag = ?
      `);
      stmt.run(new Date().toISOString(), id, containerTag);
      
      console.log(`  → Forgot memory ${id}`);
      res.json({ id, forgotten: true });
    } else if (content) {
      // Forget by content match
      const stmt = db.prepare(`
        UPDATE memories SET forgotten_at = ? 
        WHERE content = ? AND container_tag = ? AND forgotten_at IS NULL
      `);
      const result = stmt.run(new Date().toISOString(), content, containerTag);
      
      console.log(`  → Forgot ${result.changes} memories by content`);
      res.json({ id: 'content-match', forgotten: result.changes > 0 });
    } else {
      res.status(400).json({ error: 'Either id or content is required' });
    }
  } catch (error) {
    console.error('Forget error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List documents
app.post('/api/v1/documents/list', (req, res) => {
  try {
    const { containerTags, limit = 100, page = 1 } = req.body;
    const tags = containerTags || ['default'];
    
    const placeholders = tags.map(() => '?').join(',');
    const offset = (page - 1) * limit;
    
    const stmt = db.prepare(`
      SELECT id, content, created_at, updated_at
      FROM memories
      WHERE container_tag IN (${placeholders}) AND forgotten_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    
    const memories = stmt.all(...tags, limit, offset);
    
    // Get total count
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total FROM memories
      WHERE container_tag IN (${placeholders}) AND forgotten_at IS NULL
    `);
    const countResult = countStmt.get(...tags);
    
    res.json({
      memories: memories.map(m => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      })),
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete documents
app.post('/api/v1/documents/deleteBulk', (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`
      DELETE FROM memories WHERE id IN (${placeholders})
    `);
    
    const result = stmt.run(...ids);
    
    console.log(`  → Bulk deleted ${result.changes} memories`);
    res.json({ deleted: result.changes });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Promote a fact to static (persistent)
app.post('/api/v1/profile/promote', (req, res) => {
  try {
    const { containerTag, fact } = req.body;
    
    const stmt = db.prepare(`
      UPDATE profile_facts SET fact_type = 'static', updated_at = ?
      WHERE container_tag = ? AND fact = ?
    `);
    
    const result = stmt.run(new Date().toISOString(), containerTag, fact);
    
    res.json({ promoted: result.changes > 0 });
  } catch (error) {
    console.error('Promote error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stats endpoint
app.get('/api/v1/stats', (req, res) => {
  try {
    const memCount = db.prepare('SELECT COUNT(*) as count FROM memories WHERE forgotten_at IS NULL').get();
    const factCount = db.prepare('SELECT COUNT(*) as count FROM profile_facts').get();
    const containers = db.prepare('SELECT DISTINCT container_tag FROM memories').all();
    
    res.json({
      memories: memCount.count,
      facts: factCount.count,
      containers: containers.map(c => c.container_tag)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Wipe all memories for a container
app.delete('/api/v1/container/:tag', (req, res) => {
  try {
    const { tag } = req.params;
    
    db.prepare('DELETE FROM memories WHERE container_tag = ?').run(tag);
    db.prepare('DELETE FROM profile_facts WHERE container_tag = ?').run(tag);
    
    console.log(`  → Wiped container ${tag}`);
    res.json({ wiped: true, containerTag: tag });
  } catch (error) {
    console.error('Wipe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🧠 Local Supermemory Server`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Data directory: ${DATA_DIR}`);
  console.log(`   Database: ${DB_PATH}\n`);
  console.log(`Ready to accept connections!\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  db.close();
  process.exit(0);
});