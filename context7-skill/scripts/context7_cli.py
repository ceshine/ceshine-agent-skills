#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.10"
# dependencies = ["fastmcp>=2.14.0", "httpx>=0.25.0", "pyyaml>=6.0", "typer>=0.12.0"]
# ///

"""Context7 Unified CLI

Unified interface for Context7 MCP operations.
Supports library resolution and documentation queries.

Usage:
    uv run --script scripts/context7_cli.py resolve <library> [--query <query>]
    uv run --script scripts/context7_cli.py query-docs <library_id> <query>
"""

import asyncio
import json
import os
from typing import Optional
from dataclasses import dataclass

import typer
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

APP = typer.Typer()


@dataclass
class Context7Config:
    """Configuration for Context7 client."""

    api_key: str
    base_url: str = "https://api.context7.com/mcp"
    timeout: float = 30.0
    max_retries: int = 3


def get_api_key() -> str:
    """Get API key from environment variable or config file."""
    api_key = os.getenv("CONTEXT7_API_KEY")
    if not api_key:
        raise ValueError("CONTEXT7_API_KEY environment variable not found.")
    return api_key


def get_config() -> Context7Config:
    """Load configuration from environment or config file."""
    return Context7Config(
        api_key=get_api_key(),
        timeout=float(os.getenv("CONTEXT7_TIMEOUT", "30")),
        max_retries=int(os.getenv("CONTEXT7_MAX_RETRIES", "3")),
    )


class Context7Client:
    """FastMCP client wrapper for Context7 MCP server."""

    def __init__(self, config: Optional[Context7Config] = None):
        self.config = config or get_config()
        self._client: Client = Client(self._get_transport())

    def _get_transport(self) -> StreamableHttpTransport:
        """Create StreamableHttpTransport for Context7 MCP."""
        return StreamableHttpTransport(self.config.base_url, headers={"Authorization": f"Bearer {self.config.api_key}"})

    async def __aenter__(self):
        """Async context manager entry."""
        self._client = Client(self._get_transport())
        await self._client.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self._client.__aexit__(exc_type, exc_val, exc_tb)

    async def resolve_library_id(self, library_name: str, query: str) -> dict:
        """Resolve a library name to Context7 library ID."""
        if not self._client:
            raise RuntimeError("Client not initialized. Use async context manager.")

        result = await self._client.call_tool(
            "context7_resolve_library_id", {"query": query, "libraryName": library_name}
        )
        return self._parse_result(result)

    async def query_docs(self, library_id: str, query: str) -> dict:
        """Query documentation for a specific library."""
        if not self._client:
            raise RuntimeError("Client not initialized. Use async context manager.")

        result = await self._client.call_tool("context7_query_docs", {"libraryId": library_id, "query": query})
        return self._parse_result(result)

    def _parse_result(self, result) -> dict:
        """Parse FastMCP tool result into dictionary."""
        if hasattr(result, "content"):
            content = result.content
            if isinstance(content, list):
                return {"content": [str(item) for item in content]}
            return {"content": str(content)}
        return {"result": str(result)}


async def _resolve_library(library_name: str, query: str | None = None) -> dict:
    """Resolve library name to Context7 library ID."""
    query = query or library_name
    async with Context7Client() as client:
        return await client.resolve_library_id(library_name, query)


async def _query_docs(library_id: str, query: str) -> dict:
    """Query documentation for a specific library."""
    async with Context7Client() as client:
        return await client.query_docs(library_id, query)


@APP.command()
def resolve(
    library: str = typer.Argument(help="Library name to resolve"),
    query: str = typer.Option("", help="Optional query string"),
):
    """Resolve library name to Context7 library ID."""
    try:
        result = asyncio.run(_resolve_library(library, query))
        print(json.dumps(result, indent=2))
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


@APP.command()
def query_docs(
    library_id: str = typer.Argument(help="Context7 library ID"),
    query: str = typer.Argument(help="Query string"),
):
    """Query documentation for a specific library."""
    try:
        result = asyncio.run(_query_docs(library_id, query))
        print(json.dumps(result, indent=2))
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)


if __name__ == "__main__":
    APP()
