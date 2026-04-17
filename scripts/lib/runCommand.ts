import { spawnSync } from "node:child_process";

export interface RunCommandOptions {
  cwd?: string;
  envOverrides?: Record<string, string>;
}

export const runCommand = (
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): void => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      ...options.envOverrides,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const signalSuffix = result.signal ? ` (signal ${result.signal})` : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${signalSuffix}`);
  }
};
