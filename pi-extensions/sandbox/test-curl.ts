/**
 * Test script to verify sandboxed network requests via curl
 *
 * Usage:
 *   npx tsx test-curl.ts
 *
 * Expected behavior:
 * - curl to allowed domains (example.com, api.github.com) should succeed
 * - curl to non-allowed domains should be blocked
 */

import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import { runCommand } from "./test-utils";

function report(
  testName: string,
  expected: boolean,
  actual: boolean,
  reason: string,
  output: string,
) {
  const pass = expected === actual;
  const icon = pass ? "✅" : "❌";
  const status = pass ? "PASS" : "FAIL";
  const expectedIcon = expected ? "ALLOWED" : "BLOCKED";
  const actualIcon = actual ? "ALLOWED" : "BLOCKED";

  console.log(`\n--- ${testName} ---`);
  console.log(`Expected: ${expectedIcon} (${reason})`);
  console.log(`Actual:   ${actualIcon} ${icon} ${status}`);
  if (output) console.log(`Output: ${output.slice(0, 200)}`);
  return pass;
}

async function testCurl() {
  const config: SandboxRuntimeConfig = {
    network: {
      allowedDomains: ["example.com", "api.github.com"],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: [],
      allowRead: ["."],
      allowWrite: [".", "/tmp"],
      denyWrite: [],
    },
  };

  console.log("\n🧪 Testing sandboxed curl");
  console.log("=".repeat(60));
  console.log("\n📋 Configuration:");
  console.log(`  allowedDomains: ${config.network.allowedDomains.join(", ")}`);
  console.log(`  deniedDomains: ${config.network.deniedDomains.join(", ") || "(none)"}`);

  console.log("\n🚀 Initializing sandbox...");
  await SandboxManager.initialize(config);
  console.log("✅ Sandbox initialized");

  const results: boolean[] = [];

  // Test 1: Allowed domain - example.com (HTTP)
  const t1 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' http://example.com"),
    "curl http://example.com",
  );
  results.push(report(
    "Test 1: curl http://example.com",
    true,
    t1.success,
    "example.com is in allowedDomains",
    t1.output,
  ));

  // Test 2: Allowed domain - example.com (HTTPS)
  const t2 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' https://example.com"),
    "curl https://example.com",
  );
  results.push(report(
    "Test 2: curl https://example.com",
    true,
    t2.success,
    "example.com is in allowedDomains",
    t2.output,
  ));

  // Test 3: Allowed domain - api.github.com
  const t3 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' https://api.github.com"),
    "curl https://api.github.com",
  );
  results.push(report(
    "Test 3: curl https://api.github.com",
    true,
    t3.success,
    "api.github.com is in allowedDomains",
    t3.output,
  ));

  // Test 4: Blocked domain - google.com
  const t4 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' https://google.com"),
    "curl https://google.com",
  );
  results.push(report(
    "Test 4: curl https://google.com",
    false,
    t4.success,
    "google.com is NOT in allowedDomains",
    t4.output,
  ));

  // Test 5: Blocked domain - example.com subdomain
  const t5 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' https://www.example.com"),
    "curl https://www.example.com",
  );
  results.push(report(
    "Test 5: curl https://www.example.com",
    false,
    t5.success,
    "www.example.com is NOT allowed (exact match only, no wildcard)",
    t5.output,
  ));

  // Test 6: Blocked domain - github.com (not api.github.com)
  const t6 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' https://github.com"),
    "curl https://github.com",
  );
  results.push(report(
    "Test 6: curl https://github.com",
    false,
    t6.success,
    "github.com is NOT in allowedDomains (api.github.com is, but not github.com)",
    t6.output,
  ));

  // Test 7: Blocked domain - random domain
  const t7 = await runCommand(
    await SandboxManager.wrapWithSandbox("curl -s -o /dev/null -w '%{http_code}' https://random-site-12345.com"),
    "curl https://random-site-12345.com",
  );
  results.push(report(
    "Test 7: curl https://random-site-12345.com",
    false,
    t7.success,
    "random domain is NOT in allowedDomains",
    t7.output,
  ));

  // Cleanup
  console.log("\n🧹 Cleaning up...");
  await SandboxManager.reset();
  console.log("✅ Done");

  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log("\n" + "=".repeat(60));
  console.log(`📊 Summary: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log("✅ All tests passed!");
  } else {
    console.log(`❌ ${total - passed} test(s) failed`);
    process.exit(1);
  }
}

testCurl().catch(console.error);
