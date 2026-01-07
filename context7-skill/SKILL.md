---
name: context7-skill
description: This is a skill for using Context7 tools to pull up-to-date, version-specific documentation and code examples from the source. Load this skill whenever you are working with a thrid-party library or framework.
---

# Context7 Skill

## Overview

Context7 tools pull up-to-date, version-specific documentation and code examples straight from the source. They help you get accurate information about the third-party libraries or frameworks you're using. Always look up the documentation for the specific version of the library you're using. DO NOT rely on your memory. Double-check with the documentation.

You should use a **hybrid access strategy**:

- **Primary**: Direct MCP tools (i.e., `resolve_library_id`, `query_docs`)
- **Fallback**: Python script (at `scripts/context7_cli.py`) using FastMCP v2 client when MCP tools are unavailable

## Prerequisites

- uv Python package manager
- Context7 API key in environment variable `CONTEXT7_API_KEY`

## Available tools

### Library Resolver (resolve-library-id)

Resolves a package/product name to a Context7-compatible library ID and returns matching libraries.

You MUST call this function before 'query-docs' to obtain a valid Context7-compatible library ID UNLESS the user explicitly provides a library ID in the format '/org/project' or '/org/project/version' in their query.

IMPORTANT: Do not call this tool more than 3 times per question. If you cannot find what you need after 3 calls, use the best result you have.

**Example Usage:**

- local MCP: `resolve_library_id(query="react", libraryName="react")`
- Python script fallback: `uv run scripts/context7_cli.py resolve_library_id react`

### Documentation Query Tool (query-docs)

Retrieves and queries up-to-date documentation and code examples from Context7 for any programming library or framework.

You must call 'resolve-library-id' first to obtain the exact Context7-compatible library ID required to use this tool, UNLESS the user explicitly provides a library ID in the format '/org/project' or '/org/project/version' in their query.

IMPORTANT: Do not call this tool more than 3 times per question. If you cannot find what you need after 3 calls, use the best information you have.`

**Example Usage:**

- local MCP: `query_docs(libraryId="react", query="hooks")`
- Python script fallback: `uv run scripts/context7_cli.py query-docs /websites/react_dev hooks`

## Workflow

### Step 1: Pick the Right Access Method

Check if `resolve_library_id` and `query_docs` MCP tools are available (note that the actual tool names may include a prefix like `context7_` depending on your environment)

- If available → Use direct MCP tool calls
- If unavailable → Use `uv run scripts/<script>.py <tool>`

### Step 2: Lookup the Library ID

Use the `resolve-library-id` tool to identify the correct library ID for the user's query.

Selection Process:

1. Analyze the query to understand what library/package the user is looking for
2. Select the most relevant match based on:
   - Name similarity to the query (exact matches prioritized)
   - Description relevance to the query's intent
   - Documentation coverage (prioritize libraries with higher Code Snippet counts)
   - Source reputation (consider libraries with High or Medium reputation more authoritative)
   - Benchmark Score: Quality indicator (100 is the highest score)

For ambiguous queries, request clarification before proceeding with a best-guess match.

- Provide a brief explanation for why this library was chosen
- If multiple good matches exist, acknowledge this but proceed with the most relevant one
- If no good matches exist, clearly state this and suggest query refinements

### Step 3: Query the Library Documentation

Use the `query-docs` tool to retrieve relevant documentation for the identified library.

The tool returns the link for each matching document and the relevant text in the document. Example:

```markdown
Source: https://github.com/context7/react_dev/blob/main/learn.md

Functions starting with `use` are called Hooks. `useState` is a built-in Hook provided by React that allows you to add state to functional components. You can find other built-in Hooks in the API reference, and you can also write your own Hooks by combining existing ones. Hooks are more restrictive than other functions—you can only call Hooks at the top of your components or other Hooks. If you want to use `useState` in a condition or a loop, you must extract a new component and put the Hook there.
```

When a fetch tool is available and the extracted text in the tool response does not sufficiently address the query, use the fetch tool to read the entire source document.

## Configuration

### Environment Variables

| Variable           | Description          | Default  |
| ------------------ | -------------------- | -------- |
| `CONTEXT7_API_KEY` | API key for Context7 | Required |

## Resources

### scripts/

Executable Python scripts using FastMCP v2 for fallback access:

- `context7_cli.py` - Unified CLI entry point with `resolve_library_id` and `query-docs` commands

### references/

Detailed documentation:

- `troubleshooting.md` - Common issues and solutions
