---
name: markdown-dot-new
description: Retrieve the Markdown version of a public web page from a URL using the agent's built-in URL fetch capability and markdown.new. Use when a user asks for page content in Markdown, cleaner extracted page content for LLM use, or URL-to-Markdown conversion.
---

# Markdown Dot New

Convert a public web page URL into Markdown by fetching through `markdown.new`.

## Use This Skill When

- The user wants a public page converted into Markdown.
- The user wants cleaner extracted content than a normal page fetch.
- The goal is content extraction, not interactive page inspection.

## Do Not Use This Skill When

- The page requires login or other private access.
- The user needs to inspect live UI behavior or page structure.
- The input URL contains query parameters. This skill only supports the GET form `https://markdown.new/<target-url>`, and URLs with query strings would conflict with markdown.new's own query parameters.

## Workflow

1. Validate input URL.

- Confirm the user provided a full public URL (for example, `https://example.com/page`).
- If missing or malformed, ask for a valid URL.
- If the URL contains any query parameters, report that this skill does not support them and stop.

2. Confirm URL-fetch tool availability.

- Check whether the current agent/runtime can fetch URLs with its built-in fetch/browse tool.
- If URL fetch is unavailable, tell the user that this environment cannot fetch URLs, so the conversion cannot be performed, then stop.

3. Request Markdown from markdown.new.

- Build a conversion URL as `https://markdown.new/<target-url>`.
- Fetch that conversion URL with the built-in fetch tool.
- Start with the default method unless the user requests a specific one.
- Retry with `method=browser` only when the initial request returns an empty result or something that indicates the page is protected or requires JavaScript.
- Retry with `retain_images=true` only when it becomes clear after the initial request that the page is image-rich and the images likely contain important context.

4. Return result.

- Provide a concise excerpt or summary by default when the Markdown is long, and offer to continue or return more.
- Return the full Markdown only when the content is short enough or the user explicitly asks for it.
- If markdown.new returns partial or degraded output, explain that the extraction may be incomplete.
- If markdown.new returns an error (for example 429 or unsupported/protected page), report the error clearly and stop.

## Optional Parameters

Use only when requested:

- `method=auto|ai|browser`
- `retain_images=true|false`

Example with parameters: `https://markdown.new/https://example.com?method=browser&retain_images=true`

## Examples

- "Convert this article to Markdown."
- "Fetch this docs page as Markdown so I can quote it."
- "Retry that extraction with browser mode because the first result was empty."

## Failure Policy

Stop execution and report to the user when any of these occur:

- No built-in URL fetch capability is available.
- The input URL contains query parameters.
- The URL is invalid or not publicly reachable.
- markdown.new returns an error response.
