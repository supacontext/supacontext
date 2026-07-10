#!/usr/bin/env node

import { formatCliError, runCli } from "./index.js";

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  const formatted = formatCliError(error);

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: formatted })}\n`);
  } else {
    process.stderr.write(`Error [${formatted.code}]: ${formatted.message}\n`);
  }

  process.exitCode = 1;
}
