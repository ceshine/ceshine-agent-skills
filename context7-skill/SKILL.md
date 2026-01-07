---
name: context7-skill
description: CLI access to Context7 MCP tools with hybrid strategy - use direct MCP tools when available, fallback to FastMCP v2 Python scripts when not. Triggers when working with documentation lookup, library resolution, or API reference queries for programming tasks.
---

# Context7 Skill

## Overview

Provides CLI access to Context7 MCP tools for documentation lookup and library resolution. Uses a **hybrid access strategy**:

- **Primary**: Direct MCP tools (e.g., `context7_resolve_library_id`, `context7_query_docs`; note that the `context_7` prefix may be different in your environment) when available in agent environment
- **Fallback**: Python script (at `scripts/context7_cli.py`) using FastMCP v2 client when MCP tools are unavailable

## Prerequisites

- uv Python package manager
- Context7 API key in environment variable `CONTEXT7_API_KEY`

## Install uv

If you don't have uv installed:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Hybrid Access Strategy

### When Direct MCP Tools Are Available

The agent automatically uses Context7 MCP tools (`resolve_library_id` and `query_docs`) directly:

```python
# Resolve library ID
resolve_library_id(query="react", libraryName="react")

# Query documentation
query_docs(libraryId="react", query="hooks")
```

Note that the actual tool names may include a prefix like `context7_` depending on your environment.

### When MCP Tools Are Unavailable

Fallback to Python scripts using FastMCP v2 client:

```bash
# Get library ID
uv run scripts/context7_cli.py resolve react

# Query documentation using the library ID (use id-123 as an example)
uv run scripts/context7_cli.py query-docs id-123 hooks
```

### Decision Flow

- Check if `resolve_library_id` and `query_docs` tools are available (note that the actual tool names may include a prefix like `context7_` depending on your environment)
  - If available → Use direct MCP tool calls
  - If unavailable → Use `uv run scripts/<script>.py <args>`

## Direct MCP Access

When Context7 MCP tools are available in your agent environment:

### Available Tools

| Tool                          | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `context7_resolve_library_id` | Resolve library name to Context7 library ID |
| `context7_query_docs`         | Query documentation for a specific library  |

### Script Reference

- `scripts/context7_cli.py` - Unified CLI entry point with resolve, query-docs, and batch commands

## Configuration

### Environment Variables

| Variable               | Description                | Default  |
| ---------------------- | -------------------------- | -------- |
| `CONTEXT7_API_KEY`     | API key for Context7       | Required |
| `CONTEXT7_TIMEOUT`     | Request timeout in seconds | 30       |
| `CONTEXT7_MAX_RETRIES` | Maximum retry attempts     | 3        |

## Resources

### scripts/

Executable Python scripts using FastMCP v2 for fallback access:

- `context7_cli.py` - Unified CLI entry point with resolve, query-docs, and batch commands

### references/

Detailed documentation:

- `troubleshooting.md` - Common issues and solutions
