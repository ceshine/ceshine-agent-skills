/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *   - Requires: `sudo apt-get install bubblewrap socat` on Debian/Ubuntu,
 *               `sudo dnf install bubblewrap socat` on Fedora
 *   - Reference: https://code.claude.com/docs/en/sandboxing#fedora
 *
 * Note: this example intentionally overrides the built-in `bash` tool to show
 * how built-in tools can be replaced. Alternatively, you could sandbox `bash`
 * via `tool_call` input mutation without replacing the tool.
 *
 * Config files (merged, project takes precedence):
 * - ~/.pi/agent/extensions/sandbox.json (global)
 * - <cwd>/.pi/sandbox.json (project-local)
 *
 * Example .pi/sandbox.json:
 * ```json
 * {
 *   "enabled": true,
 *   "ignoreList": ["docker ", "kubectl "],
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["/Users", "/home"],
 *     "allowRead": [".", "./docs"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   }
 * }
 * ```
 *
 * IMPORTANT: Read uses a "deny-then-allow" pattern:
 * - By default, ALL reads are ALLOWED.
 * - denyRead blocks broad regions (e.g., "/Users", "~/.ssh")
 * - allowRead RE-ALLOWS specific paths WITHIN denied regions.
 * - Without a matching denyRead, allowRead has no effect!
 *
 * Write uses an "allow-only" pattern:
 * - By default, ALL writes are DENIED.
 * - allowWrite must explicitly list allowed paths.
 * - denyWrite creates exceptions within allowed paths.
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Setup:
 * 1. Copy sandbox/ directory to ~/.pi/agent/extensions/
 * 2. Run `npm install` in ~/.pi/agent/extensions/sandbox/
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type BashOperations,
  createBashTool,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";

interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean;
  ignoreList?: string[]; // Command prefixes that bypass sandbox with confirmation
}

function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

function expandFilesystemPaths(config: SandboxConfig): SandboxConfig {
  if (!config.filesystem) return config;

  return {
    ...config,
    filesystem: {
      ...config.filesystem,
      denyRead: config.filesystem.denyRead?.map(expandTilde),
      allowRead: config.filesystem.allowRead?.map(expandTilde),
      allowWrite: config.filesystem.allowWrite?.map(expandTilde),
      denyWrite: config.filesystem.denyWrite?.map(expandTilde),
    },
  };
}

const SANDBOX_TMP_DIR = '/tmp/pi-sandbox';

function shouldBypassSandbox(
  command: string,
  ignoreList?: string[],
): { bypass: boolean; matchedPrefix?: string } {
  if (!ignoreList || ignoreList.length === 0) {
    return { bypass: false };
  }
  for (const prefix of ignoreList) {
    if (command.startsWith(prefix)) {
      return { bypass: true, matchedPrefix: prefix };
    }
  }
  return { bypass: false };
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  ignoreList: [],
  network: {
    allowedDomains: [
      "npmjs.org",
      "*.npmjs.org",
      "registry.npmjs.org",
      "registry.yarnpkg.com",
      "pypi.org",
      "*.pypi.org",
      "github.com",
      "*.github.com",
      "api.github.com",
      "raw.githubusercontent.com",
    ],
    deniedDomains: [],
  },
  filesystem: {
    // NOTE: Read uses "deny-then-allow" pattern:
    // - denyRead blocks regions (all reads allowed if empty)
    // - allowRead re-allows within denied regions
    // This restricts reads to workspace only:
    denyRead: ["/Users", "/home"],
    allowRead: ["."],
    allowWrite: [".", "/tmp"],
    denyWrite: [".env", ".env.*", "*.pem", "*.key"],
  },
};

function loadConfig(cwd: string): SandboxConfig {
  const projectConfigPath = join(cwd, ".pi", "sandbox.json");
  const globalConfigPath = join(getAgentDir(), "extensions", "sandbox.json");

  let globalConfig: Partial<SandboxConfig> = {};
  let projectConfig: Partial<SandboxConfig> = {};

  if (existsSync(globalConfigPath)) {
    try {
      globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
    } catch (e) {
      console.error(`Warning: Could not parse ${globalConfigPath}: ${e}`);
    }
  }

  if (existsSync(projectConfigPath)) {
    try {
      projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
    } catch (e) {
      console.error(`Warning: Could not parse ${projectConfigPath}: ${e}`);
    }
  }

  return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function deepMerge(
  base: SandboxConfig,
  overrides: Partial<SandboxConfig>,
): SandboxConfig {
  const result: SandboxConfig = { ...base };

  if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
  if (overrides.network) {
    result.network = { ...base.network, ...overrides.network };
  }
  if (overrides.filesystem) {
    result.filesystem = { ...base.filesystem, ...overrides.filesystem };
  }
  if (overrides.ignoreList !== undefined) {
    result.ignoreList = overrides.ignoreList;
  }

  const extOverrides = overrides as {
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
  };
  const extResult = result as {
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
  };

  if (extOverrides.ignoreViolations) {
    extResult.ignoreViolations = extOverrides.ignoreViolations;
  }
  if (extOverrides.enableWeakerNestedSandbox !== undefined) {
    extResult.enableWeakerNestedSandbox =
      extOverrides.enableWeakerNestedSandbox;
  }

  return result;
}

function createSandboxedBashOps(): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout }) {
      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`);
      }

      const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

      return new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", wrappedCommand], {
          cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                child.kill("SIGKILL");
              }
            }
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        const onAbort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("no-sandbox", {
    description: "Disable OS-level sandboxing for bash commands",
    type: "boolean",
    default: false,
  });

  const localCwd = process.cwd();
  const localBash = createBashTool(localCwd);

  let sandboxEnabled = false;
  let sandboxInitialized = false;
  let currentConfig: SandboxConfig | undefined;

  pi.registerTool({
    ...localBash,
    label: "bash (sandboxed)",
    async execute(id, params, signal, onUpdate, ctx) {
      if (!sandboxEnabled || !sandboxInitialized) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const command = params.command as string;
      const bypassCheck = shouldBypassSandbox(
        command,
        currentConfig?.ignoreList,
      );

      if (bypassCheck.bypass) {
        if (!ctx.hasUI) {
          return {
            content: [
              {
                type: "text",
                text: "Sandbox-bypassing command denied because of no UI available for confirmation.",
              },
            ],
            block: true,
            reason:
              "Command matches sandbox bypass prefix but no UI available for confirmation",
          };
        }

        const choice = await ctx.ui.select(
          `⚠️ Command bypasses sandbox:\n\n  ${command}\n\nAllow unsandboxed execution?`,
          ["Yes", "No"],
        );

        if (choice !== "Yes") {
          return {
            content: [
              {
                type: "text",
                text: "Sandbox-bypassing command denied. Stop and consult the user.",
              },
            ],
            block: true,
            reason: "Sandbox-bypassing command denied by user",
          };
        }

        ctx.ui.notify("⚠️ Running a sandbox-bypassing command", "warning");

        return localBash.execute(id, params, signal, onUpdate);
      }

      const sandboxedBash = createBashTool(localCwd, {
        operations: createSandboxedBashOps(),
      });
      return sandboxedBash.execute(id, params, signal, onUpdate);
    },
  });

  pi.on("user_bash", async (event, ctx) => {
    if (!sandboxEnabled || !sandboxInitialized) return;

    const command = (event.command as string) || "";
    const bypassCheck = shouldBypassSandbox(command, currentConfig?.ignoreList);

    if (bypassCheck.bypass) {
      if (!ctx.hasUI) {
        // Return a dummy operation that rejects instead of trying to block
        return {
          operations: {
            exec: async () => {
              throw new Error(
                "Command matches sandbox bypass prefix but no UI available for confirmation",
              );
            },
          },
        };
      }

      const choice = await ctx.ui.select(
        `⚠️ Command bypasses sandbox:\n\n  ${command}\n\nAllow unsandboxed execution?`,
        ["Yes", "No"],
      );

      if (choice !== "Yes") {
        // Return a dummy operation that rejects instead of trying to block
        return {
          operations: {
            exec: async () => {
              throw new Error("Sandbox-bypassing command denied by user");
            },
          },
        };
      }

      // User approved - don't return anything to use default (unsandboxed) operations
      return;
    }

    return { operations: createSandboxedBashOps() };
  });

  pi.on("session_start", async (_event, ctx) => {
    const noSandbox = pi.getFlag("no-sandbox") as boolean;

    if (noSandbox) {
      sandboxEnabled = false;
      ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
      return;
    }

    currentConfig = loadConfig(ctx.cwd);
    const config = currentConfig;

    if (!config.enabled) {
      sandboxEnabled = false;
      ctx.ui.notify("Sandbox disabled via config", "info");
      return;
    }

    const platform = process.platform;
    if (platform !== "darwin" && platform !== "linux") {
      sandboxEnabled = false;
      ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
      return;
    }

    try {
      // Use /tmp/pi-sandbox instead of /tmp/claude to avoid conflicts
      process.env.CLAUDE_TMPDIR = SANDBOX_TMP_DIR;
      mkdirSync(SANDBOX_TMP_DIR, { recursive: true });

      const configExt = config as unknown as {
        ignoreViolations?: Record<string, string[]>;
        enableWeakerNestedSandbox?: boolean;
      };

      const configWithExpandedPaths = expandFilesystemPaths(config);

      await SandboxManager.initialize({
        network: configWithExpandedPaths.network,
        filesystem: configWithExpandedPaths.filesystem,
        ignoreViolations: configExt.ignoreViolations,
        enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
      });

      sandboxEnabled = true;
      sandboxInitialized = true;

      const networkCount = config.network?.allowedDomains?.length ?? 0;
      const denyReadCount = config.filesystem?.denyRead?.length ?? 0;
      const allowReadCount = config.filesystem?.allowRead?.length ?? 0;
      const writeCount = config.filesystem?.allowWrite?.length ?? 0;
      const ignoreListCount = config.ignoreList?.length ?? 0;
      ctx.ui.setStatus(
        "sandbox",
        ctx.ui.theme.fg(
          "accent",
          `🔒 Sandbox: ${networkCount} domains, ${denyReadCount}+${allowReadCount} read paths, ${writeCount} write paths, ${ignoreListCount} ignore`,
        ),
      );
      ctx.ui.notify("Sandbox initialized", "info");
    } catch (err) {
      sandboxEnabled = false;
      ctx.ui.notify(
        `Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    if (sandboxInitialized) {
      try {
        await SandboxManager.reset();
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  pi.registerCommand("sandbox", {
    description: "Show sandbox configuration",
    handler: async (_args, ctx) => {
      if (!sandboxEnabled) {
        ctx.ui.notify("Sandbox is disabled", "info");
        return;
      }

      const config = loadConfig(ctx.cwd);
      const lines = [
        "Sandbox Configuration:",
        "",
        "Network:",
        `  Allowed: ${config.network?.allowedDomains?.join(", ") || "(none)"}`,
        `  Denied: ${config.network?.deniedDomains?.join(", ") || "(none)"}`,
        "",
        "Filesystem:",
        `  Allow Read: ${config.filesystem?.allowRead?.join(", ") || "(none)"}`,
        `  Deny Read: ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
        `  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
        `  Deny Write: ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
        "",
        `Ignore List: ${config.ignoreList?.join(", ") || "(none)"}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
