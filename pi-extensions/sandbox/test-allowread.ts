/**
 * Test script to verify allowRead behavior
 *
 * Usage:
 *   npx tsx test-allowread.ts [test-name]
 *
 * Test names:
 *   1. default: deny /home or /Users, allow .
 *   2. home-tilde: deny ~, allow .
 *
 * Expected behavior:
 * - denyRead blocks a region (e.g., "/Users", "/home", or "~")
 * - allowRead re-allows specific paths WITHIN the denied region
 * - Without denyRead, allowRead has no effect
 */

import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import { runCommand } from "./test-utils";

async function testAllowRead(testName: string = "default") {
  const platform = process.platform;
  const isMacos = platform === "darwin";
  const isLinux = platform === "linux";

  if (!isMacos && !isLinux) {
    console.log(`❌ Sandbox not supported on ${platform}`);
    process.exit(1);
  }

  // Get the actual home directory path
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/home";
  const currentDir = process.cwd();

  console.log(`\n🧪 Testing allowRead behavior on ${platform}`);
  console.log(`   Test: ${testName}`);
  console.log("=".repeat(60));
  console.log(`   homeDir: ${homeDir}`);
  console.log(`   currentDir: ${currentDir}`);

  // Determine config based on test name
  let config: SandboxRuntimeConfig;

  if (testName === "home-tilde") {
    // Test: deny ~ (home directory), allow ~/bin
    config = {
      network: {
        allowedDomains: [],
        deniedDomains: [],
      },
      filesystem: {
        // Deny the home directory using ~ (tilde)
        denyRead: ["~"],
        // Re-allow ~/bin directory within the denied home
        allowRead: ["~/bin"],
        // Allow writing to current directory only
        allowWrite: ["."],
        // Don't deny any writes within allowed paths
        denyWrite: [],
      },
    };
    console.log("\n📋 Testing: deny ~ (home) with allowRead ~/bin");
  } else {
    // Default test: deny /home (or /Users), allow .
    config = {
      network: {
        allowedDomains: [],
        deniedDomains: [],
      },
      filesystem: {
        // Deny all of /home (Linux) or /Users (macOS)
        denyRead: isLinux ? ["/home"] : ["/Users"],
        // Re-allow current directory
        allowRead: ["."],
        // Allow writing to current directory only
        allowWrite: ["."],
        // Don't deny any writes within allowed paths
        denyWrite: [],
      },
    };
    console.log("\n📋 Testing: deny /home (or /Users) with allowRead . (current dir)");
  }

  console.log("\n📋 Configuration:");
  console.log(`  denyRead: ${config.filesystem.denyRead.join(", ")}`);
  console.log(`  allowRead: ${config.filesystem.allowRead.join(", ")}`);
  console.log(`  allowWrite: ${config.filesystem.allowWrite.join(", ")}`);

  // Expected results for this test
  const expectedResults = testName === "home-tilde"
    ? {
        test1: { allowed: false, reason: "current dir is not in allowRead '~/bin'" },
        test2: { allowed: false, reason: "'..' is outside the allowed '~/bin'" },
        test3: { allowed: false, reason: "home dir is in denied '~'" },
        test4: { allowed: true, reason: "~/bin is explicitly in allowRead" },
      }
    : {
        test1: { allowed: true, reason: "allowRead has '.' which includes current dir" },
        test2: { allowed: false, reason: "'..' is outside the allowed '.'" },
        test3: { allowed: false, reason: "testDir is in denied region" },
      };

  console.log("\n🚀 Initializing sandbox...");
  await SandboxManager.initialize(config);
  console.log("✅ Sandbox initialized");

  // Test 1: Read current directory
  console.log("\n--- Test 1: Read current directory (.)");
  const test1 = await runCommand(
    await SandboxManager.wrapWithSandbox("ls -la ."),
    "ls -la .",
  );
  const test1Expected = expectedResults.test1.allowed ? "✅" : "❌";
  const test1Actual = test1.success ? "✅" : "❌";
  const test1Status = test1.success === expectedResults.test1.allowed ? "PASS" : "FAIL";
  console.log(`Expected: ${test1Expected} ${expectedResults.test1.reason}`);
  console.log(`Result: ${test1Actual} ${test1Status}`);
  if (test1.output) console.log(`Output: ${test1.output}`);

  // Test 2: Read parent directory (should be denied)
  console.log("\n--- Test 2: Read parent directory (..)");
  const test2 = await runCommand(
    await SandboxManager.wrapWithSandbox("ls -la .."),
    "ls -la ..",
  );
  const test2Expected = expectedResults.test2.allowed ? "✅" : "❌";
  const test2Actual = test2.success ? "✅" : "❌";
  const test2Status = test2.success === expectedResults.test2.allowed ? "PASS" : "FAIL";
  console.log(`Expected: ${test2Expected} ${expectedResults.test2.reason}`);
  console.log(`Result: ${test2Actual} ${test2Status}`);
  if (test2.output) console.log(`Output: ${test2.output}`);

  // Test 3: Read /home (Linux) or /tmp (macOS) - should be denied by default
  let testDir: string;
  if (testName === "home-tilde") {
    // When denying ~, also test the actual home directory
    testDir = homeDir;
  } else {
    testDir = isLinux ? "/home" : "/tmp";
  }
  console.log(`\n--- Test 3: Read ${testDir} ---`);
  const test3 = await runCommand(
    await SandboxManager.wrapWithSandbox(`ls -la ${testDir}`),
    `ls -la ${testDir}`,
  );
  const test3Expected = expectedResults.test3.allowed ? "✅" : "❌";
  const test3Actual = test3.success ? "✅" : "❌";
  const test3Status = test3.success === expectedResults.test3.allowed ? "PASS" : "FAIL";
  console.log(`Expected: ${test3Expected} ${expectedResults.test3.reason}`);
  console.log(`Result: ${test3Actual} ${test3Status}`);
  if (test3.output) console.log(`Output: ${test3.output}`);

  // Test 4: Read ~/bin directory (should be allowed for home-tilde test)
  if (testName === "home-tilde") {
    console.log("\n--- Test 4: Read ~/bin directory ---");
    const test4 = await runCommand(
      await SandboxManager.wrapWithSandbox("ls -la ~/bin"),
      "ls -la ~/bin",
    );
    const test4Expected = expectedResults.test4!.allowed ? "✅" : "❌";
    const test4Actual = test4.success ? "✅" : "❌";
    const test4Status = test4.success === expectedResults.test4!.allowed ? "PASS" : "FAIL";
    console.log(`Expected: ${test4Expected} ${expectedResults.test4!.reason}`);
    console.log(`Result: ${test4Actual} ${test4Status}`);
    if (test4.output) console.log(`Output: ${test4.output}`);
  }

  // Cleanup
  console.log("\n🧹 Cleaning up...");
  await SandboxManager.reset();
  console.log("✅ Done");

  console.log("\n" + "=".repeat(60));
  if (testName === "home-tilde") {
    console.log("📊 Summary for '~' in denyRead with '~/bin' in allowRead:");
    console.log("  - Test 1 (.): Should be DENIED (not in allowRead)");
    console.log("  - Test 2 (..): Should be DENIED (outside allowRead)");
    console.log("  - Test 3 (home): DENIED (in denyRead ~)");
    console.log("  - Test 4 (~/bin): ALLOWED (explicitly in allowRead)");
  } else {
    console.log("📊 Summary for deny /home (or /Users) with '.' in allowRead:");
    console.log("  - Test 1 (.): Should be ALLOWED (allowRead has '.')");
    console.log("  - Test 2 (..): Should be DENIED (outside allowRead)");
    console.log("  - Test 3 (home or /tmp): DENIED if in denied region");
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const testName = args[0] || "default";

if (testName === "home-tilde") {
  console.log("\n🔬 Testing: deny ~ with allowRead .\n");
} else {
  console.log("\n🔬 Testing: deny /home (or /Users) with allowRead .\n");
}

testAllowRead(testName).catch(console.error);
