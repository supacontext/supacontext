#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(repoRoot, ".env");
const [, , command, ...args] = process.argv;
const requireFromCwd = createRequire(resolve(process.cwd(), "package.json"));

if (!command) {
  console.error("Usage: node scripts/with-root-env.mjs <command> [...args]");
  process.exit(1);
}

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");

  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);

    if (parsed && process.env[parsed[0]] === undefined) {
      process.env[parsed[0]] = parsed[1];
    }
  }
}

function resolveCommand(input, inputArgs) {
  if (input === "node") {
    return {
      command: process.execPath,
      args: inputArgs,
    };
  }

  if (input === "turbo") {
    return {
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules/turbo/bin/turbo"), ...inputArgs],
    };
  }

  if (input === "tsx") {
    return {
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules/tsx/dist/cli.mjs"), ...inputArgs],
    };
  }

  if (input === "next") {
    return {
      command: process.execPath,
      args: [requireFromCwd.resolve("next/dist/bin/next"), ...inputArgs],
    };
  }

  return {
    command: input,
    args: inputArgs,
  };
}

const resolved = resolveCommand(command, args);
const child = spawn(resolved.command, resolved.args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
