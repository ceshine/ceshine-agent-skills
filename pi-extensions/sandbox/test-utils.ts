import { spawn } from "child_process";

export async function runCommand(
  wrappedCommand: string,
  _label: string,
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn("bash", ["-c", wrappedCommand], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.stderr?.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      resolve({ success: code === 0, output: output.trim() });
    });

    child.on("error", (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}
