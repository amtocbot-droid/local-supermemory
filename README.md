# Local Supermemory Clone

A local implementation of the Supermemory API for OpenClaw that stores all data locally on your machine.

## Quick Start

```bash
# Start the server
cd ~/local-supermemory
npm start

# In another terminal, restart OpenClaw gateway
openclaw gateway --force
```

## What This Does

- **Local Storage**: All memories stored in SQLite at `~/.local-supermemory/memories.db`
- **No Cloud Required**: Works entirely offline, no API keys needed
- **Same API**: Implements the same endpoints as the cloud Supermemory service
- **Profile Building**: Automatically extracts facts from conversations

## Configuration

In `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": { "memory": "openclaw-local-supermemory" },
    "entries": {
      "openclaw-local-supermemory": {
        "enabled": true,
        "config": {
          "baseUrl": "http://localhost:3456",
          "containerTag": "my-memories",
          "autoRecall": true,
          "autoCapture": true,
          "maxRecallResults": 10,
          "debug": false
        }
      }
    }
  }
}
```

## Available Tools

- `supermemory_store` - Save information to memory
- `supermemory_search` - Search memories by query
- `supermemory_forget` - Delete a memory
- `supermemory_profile` - View user profile

## Slash Commands

- `/remember <text>` - Save something to memory
- `/recall <query>` - Search your memories

## API Endpoints

The server implements these endpoints:

- `POST /api/v1/add` - Add a memory
- `POST /api/v1/search/memories` - Search memories
- `GET /api/v1/profile` - Get user profile
- `POST /api/v1/memories/forget` - Forget a memory
- `POST /api/v1/documents/list` - List documents
- `POST /api/v1/documents/deleteBulk` - Bulk delete
- `GET /api/v1/stats` - Get statistics

## Environment Variables

- `LOCAL_SUPERMEMORY_PORT` - Server port (default: 3456)
- `LOCAL_SUPERMEMORY_DATA_DIR` - Data directory (default: ~/.local-supermemory)

## Tips

1. Start the server before launching OpenClaw
2. Use `debug: true` in config to see detailed logs
3. Run `curl http://localhost:3456/health` to check server status