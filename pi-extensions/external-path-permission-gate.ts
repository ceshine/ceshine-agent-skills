/**
 * External Path Permission Gate Extension
 *
 * Prompts for permission before read/edit/write operations on paths outside the
 * current working directory, unless the target path is allowlisted in
 * settings.json.
 *
 * ⚠️ Note: This extension only blocks the read, write, and edit tools. It does NOT
 * prevent the agent from using bash tools (e.g., `cat`, `ls`, `find`) to access
 * files outside the current working directory. If you need to prevent all external
 * path access, use a sandbox (e.g., bubblewrap, gvisor, or container isolation).
 *
 * Configurable via settings.json custom fields, e.g.:
 * {
 *   "allowedExternalPaths": ["../shared", "~/notes", "/tmp"]
 * }
 *
 * Supported aliases:
 * - externalPathWhitelist
 * - allowedPathsOutsideCwd
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

type ExternalPathSettings = {
  allowedExternalPaths: string[];
};

const DEFAULT_SETTINGS: ExternalPathSettings = {
  allowedExternalPaths: [],
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function getOptionalStringArray(
  settings: Record<string, unknown>,
  key: string,
): string[] | undefined {
  if (!hasOwn(settings, key)) {
    return undefined;
  }
  return toStringArray(settings[key]);
}

function stripLeadingAt(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

function canonicalizeAbsolutePath(path: string): string {
  let current = path;
  const missingSegments: string[] = [];

  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    missingSegments.unshift(basename(current));
    current = parent;
  }

  let canonicalBase = current;
  if (existsSync(current)) {
    try {
      canonicalBase = realpathSync(current);
    } catch {
      canonicalBase = current;
    }
  }

  return resolve(canonicalBase, ...missingSegments);
}

function isWithinPath(parentPath: string, childPath: string): boolean {
  const rel = relative(parentPath, childPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function resolveConfiguredPath(
  configuredPath: string,
  cwd: string,
  settingsPath: string,
): string {
  const trimmed = configuredPath.trim();
  const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");

  let absolutePath: string;
  if (trimmed.startsWith("~/")) {
    absolutePath = resolve(homedir(), trimmed.slice(2));
  } else if (isAbsolute(trimmed)) {
    absolutePath = trimmed;
  } else if (settingsPath === globalSettingsPath) {
    absolutePath = resolve(homedir(), trimmed);
  } else {
    absolutePath = resolve(cwd, trimmed);
  }

  return canonicalizeAbsolutePath(absolutePath);
}

function loadSettingsFile(
  settingsPath: string,
  cwd: string,
): ExternalPathSettings | null {
  if (!existsSync(settingsPath)) {
    return null;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content) as Record<string, unknown>;

    const allowedExternalPathsRaw =
      getOptionalStringArray(settings, "allowedExternalPaths") ??
      getOptionalStringArray(settings, "externalPathWhitelist") ??
      getOptionalStringArray(settings, "allowedPathsOutsideCwd");

    if (allowedExternalPathsRaw === undefined) {
      return null; // Not configured in this file; allow fallback to other sources.
    }

    return {
      allowedExternalPaths: allowedExternalPathsRaw.map((path) =>
        resolveConfiguredPath(path, cwd, settingsPath),
      ),
    };
  } catch {
    return null;
  }
}

function loadSettings(cwd: string): ExternalPathSettings {
  const projectSettingsPath = join(cwd, ".pi", "settings.json");
  const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");

  const globalSettings = loadSettingsFile(globalSettingsPath, cwd);
  const projectSettings = loadSettingsFile(projectSettingsPath, cwd);

  return projectSettings ?? globalSettings ?? DEFAULT_SETTINGS;
}

function getPermissionFolder(targetPath: string): string {
  if (existsSync(targetPath)) {
    try {
      if (statSync(targetPath).isDirectory()) {
        return targetPath;
      }
    } catch {
      // Fall through to dirname(targetPath)
    }
  }

  return dirname(targetPath);
}

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const cwdRoot = canonicalizeAbsolutePath(cwd);
  const { allowedExternalPaths } = loadSettings(cwd);
  const sessionAllowlist = new Set<string>();

  pi.on("tool_call", async (event, ctx) => {
    if (
      event.toolName !== "read" &&
      event.toolName !== "write" &&
      event.toolName !== "edit"
    ) {
      return undefined;
    }

    const rawPath = event.input.path;
    if (typeof rawPath !== "string") {
      return undefined;
    }

    const toolPath = stripLeadingAt(rawPath);
    const absoluteTargetPath = canonicalizeAbsolutePath(resolve(cwd, toolPath));

    if (isWithinPath(cwdRoot, absoluteTargetPath)) {
      return undefined;
    }

    const isWhitelisted = allowedExternalPaths.some((allowedPath) =>
      isWithinPath(allowedPath, absoluteTargetPath),
    );
    if (isWhitelisted) {
      return undefined;
    }

    const permissionFolder = getPermissionFolder(absoluteTargetPath);
    const approvalKey = `${event.toolName}:${permissionFolder}`;

    if (sessionAllowlist.has(approvalKey)) {
      return undefined;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Path "${absoluteTargetPath}" is outside the current working directory and no UI is available for confirmation`,
      };
    }

    const choice = await ctx.ui.select(
      `⚠️ ${event.toolName.toUpperCase()} outside current working directory\n\nCWD: ${cwdRoot}\nTarget: ${absoluteTargetPath}\nFolder: ${permissionFolder}\n\nAllow?`,
      ["Allow once", "Allow folder this session", "Block"],
    );

    if (choice === "Allow folder this session") {
      sessionAllowlist.add(approvalKey);
      return undefined;
    }

    if (choice === "Allow once") {
      return undefined;
    }

    ctx.ui.notify(
      `Blocked ${event.toolName} outside cwd: ${absoluteTargetPath}`,
      "warning",
    );
    return {
      block: true,
      reason: `Blocked by user: path "${absoluteTargetPath}" is outside the current working directory`,
    };
  });
}
