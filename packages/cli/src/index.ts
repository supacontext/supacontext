import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  SupaContext,
  SupaContextError,
  type ContextCreateInput,
  type ContextEffort,
  type Platform,
} from "@supacontext/sdk";
import {
  DEFAULT_API_URL,
  DEFAULT_APP_URL,
  getConfigPath,
  readConfig,
  resolveProfile,
  saveProfile,
  writeConfig,
} from "./config.js";
import {
  authorizeDevice,
  createApiKey,
  discoverCli,
  listApiKeys,
  pollDeviceAuthentication,
  revokeCliCredential,
  type DashboardApiKey,
} from "./device-auth.js";
import { CliError } from "./errors.js";

export * from "./config.js";
export * from "./device-auth.js";
export * from "./errors.js";

const efforts = ["low", "medium", "high", "x_high", "auto"] as const;
const keyEfforts = ["low", "medium", "high", "x_high"] as const;
const platforms = [
  "web",
  "reddit",
  "x",
  "youtube",
  "facebook",
  "news",
  "forums",
  "places",
  "linkedin",
  "hackernews",
  "github",
] as const;

type CliInput = Readable & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => unknown;
};

export type CliDependencies = {
  env: NodeJS.ProcessEnv;
  stdin: CliInput;
  stdout: Writable;
  stderr: Writable;
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  openUrl: (url: string) => Promise<boolean>;
  configPath: string;
};

export async function runCli(
  argv: string[],
  overrides: Partial<CliDependencies> = {},
): Promise<void> {
  const dependencies: CliDependencies = {
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    fetch,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    openUrl: openBrowser,
    configPath: getConfigPath(overrides.env ?? process.env),
    ...overrides,
  };
  const [group, command, ...args] = argv;

  if (!group || group === "help" || group === "--help" || group === "-h") {
    dependencies.stdout.write(helpText);
    return;
  }

  if (group === "--version" || group === "-v") {
    dependencies.stdout.write("0.0.0\n");
    return;
  }

  if (group === "auth" && command === "login") {
    await login(args, dependencies);
    return;
  }

  if (group === "auth" && command === "set-key") {
    await setKey(args, dependencies);
    return;
  }

  if (group === "auth" && command === "status") {
    await authStatus(args, dependencies);
    return;
  }

  if (group === "profile" && command === "list") {
    await listProfiles(args, dependencies);
    return;
  }

  if (group === "profile" && command === "use") {
    await useProfile(args, dependencies);
    return;
  }

  if (group === "context" && command === "create") {
    await createContext(args, dependencies);
    return;
  }

  if (group === "context" && command === "get") {
    await getContext(args, dependencies);
    return;
  }

  throw new CliError(
    "UNKNOWN_COMMAND",
    `Unknown command: ${[group, command].filter(Boolean).join(" ")}`,
  );
}

async function login(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values } = parseCommandArgs(args, {
    profile: { type: "string" },
    "app-url": { type: "string" },
    "api-url": { type: "string" },
    "create-key": { type: "string" },
    "max-effort": { type: "string" },
    "monthly-credit-limit": { type: "string" },
    "no-open": { type: "boolean" },
    json: { type: "boolean" },
  });
  const current = await resolveProfile({
    env: dependencies.env,
    name: values.profile ? profileName(values.profile) : undefined,
    path: dependencies.configPath,
  });
  const profile = profileName(current.name);
  const appUrl = validUrl(values["app-url"] ?? current.appUrl, "app URL");
  const discovery = await discoverCli(appUrl, dependencies.fetch);
  const authorization = await authorizeDevice(discovery, dependencies.fetch);
  const verificationUrl = validUrl(
    authorization.verification_uri_complete ?? authorization.verification_uri,
    "verification URL",
  );
  const opened = values["no-open"] ? false : await dependencies.openUrl(verificationUrl);

  dependencies.stderr.write(
    `${opened ? "Opened" : "Open"} ${verificationUrl}\nConfirm code ${authorization.user_code} in the browser. Waiting for authorization...\n`,
  );

  const authenticated = await pollDeviceAuthentication({
    discovery,
    authorization,
    fetch: dependencies.fetch,
    sleep: dependencies.sleep,
  });
  const selected = await (async () => {
    try {
      const activeKeys = (
        await listApiKeys(appUrl, authenticated.access_token, dependencies.fetch)
      ).filter((key) => !key.revokedAt);

      return values["create-key"]
        ? await createSelectedKey({
            name: values["create-key"],
            maxEffort: values["max-effort"],
            monthlyCreditLimit: values["monthly-credit-limit"],
            appUrl,
            accessToken: authenticated.access_token,
            fetch: dependencies.fetch,
          })
        : await selectKeyInteractively(activeKeys, appUrl, authenticated.access_token, {
            ...dependencies,
            stdout: values.json ? dependencies.stderr : dependencies.stdout,
          });
    } catch (error) {
      await revokeCliCredential(
        appUrl,
        authenticated.access_token,
        dependencies.fetch,
      ).catch(() => undefined);
      throw error;
    }
  })();

  await revokeCliCredential(
    appUrl,
    authenticated.access_token,
    dependencies.fetch,
  ).catch(() => undefined);
  const apiUrl = validUrl(values["api-url"] ?? discovery.api_url, "API URL");

  await saveProfile(
    profile,
    {
      api_key: selected.rawKey,
      api_url: apiUrl,
      app_url: appUrl,
      key_id: selected.key.id,
      key_name: selected.key.name,
    },
    dependencies.configPath,
  );

  const output = {
    ok: true,
    profile,
    authenticated: true,
    api_key: publicKey(selected.key),
  };

  if (values.json) {
    writeJson(dependencies.stdout, output, true);
  } else {
    dependencies.stdout.write(
      `Configured profile "${profile}" with API key "${selected.key.name}".\n`,
    );
  }
}

async function selectKeyInteractively(
  keys: DashboardApiKey[],
  appUrl: string,
  accessToken: string,
  dependencies: CliDependencies,
): Promise<{ key: DashboardApiKey; rawKey: string }> {
  if (!dependencies.stdin.isTTY) {
    throw new CliError(
      "KEY_SELECTION_REQUIRED",
      "Use --create-key <name> for non-interactive browser login, or run in an interactive terminal to select an existing key.",
      { keys: keys.map(publicKey) },
    );
  }

  if (keys.length > 0) {
    dependencies.stdout.write("Available API keys:\n");
    keys.forEach((key, index) => {
      dependencies.stdout.write(`  ${index + 1}. ${key.name} (${key.prefix}...)\n`);
    });
    dependencies.stdout.write("  c. Create a new key\n");

    const answer = (await question(dependencies, "Select a key: ")).trim().toLowerCase();

    if (answer !== "c") {
      const index = Number.parseInt(answer, 10) - 1;
      const key = keys[index];

      if (!key) {
        throw new CliError("INVALID_SELECTION", "Choose one of the listed API keys or c.");
      }

      const rawKey = await readSecret(dependencies, "Paste this API key: ");
      assertApiKey(rawKey);

      if (!rawKey.startsWith(key.prefix)) {
        throw new CliError(
          "API_KEY_MISMATCH",
          "The pasted key does not match the selected API key.",
        );
      }

      return { key, rawKey };
    }
  }

  const name =
    (await question(dependencies, "New key name [Supacontext CLI]: ")).trim() || "Supacontext CLI";

  return createSelectedKey({
    name,
    appUrl,
    accessToken,
    fetch: dependencies.fetch,
  });
}

async function createSelectedKey(input: {
  name: string;
  maxEffort?: string | undefined;
  monthlyCreditLimit?: string | undefined;
  appUrl: string;
  accessToken: string;
  fetch: typeof fetch;
}): Promise<{ key: DashboardApiKey; rawKey: string }> {
  const maxEffort = normalizeKeyEffort(input.maxEffort ?? "x_high");
  const monthlyCreditLimit = parseMonthlyLimit(input.monthlyCreditLimit);
  const result = await createApiKey({
    appUrl: input.appUrl,
    accessToken: input.accessToken,
    name: input.name,
    maxEffort,
    monthlyCreditLimit,
    fetch: input.fetch,
  });

  assertApiKey(result.rawKey);
  return result;
}

async function setKey(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values } = parseCommandArgs(args, {
    profile: { type: "string" },
    "app-url": { type: "string" },
    "api-url": { type: "string" },
    "key-stdin": { type: "boolean" },
    json: { type: "boolean" },
  });
  const current = await resolveProfile({
    env: dependencies.env,
    name: values.profile ? profileName(values.profile) : undefined,
    path: dependencies.configPath,
  });
  const profile = profileName(current.name);
  const rawKey = dependencies.stdin.isTTY
    ? await readSecret(dependencies, "Supacontext API key: ")
    : await readSecretFromPipe(dependencies.stdin);

  assertApiKey(rawKey);
  await saveProfile(
    profile,
    {
      api_key: rawKey,
      api_url: validUrl(values["api-url"] ?? current.apiUrl ?? DEFAULT_API_URL, "API URL"),
      app_url: validUrl(values["app-url"] ?? current.appUrl ?? DEFAULT_APP_URL, "app URL"),
    },
    dependencies.configPath,
  );

  if (values.json) {
    writeJson(dependencies.stdout, { ok: true, profile, configured: true }, true);
  } else {
    dependencies.stdout.write(`Configured profile "${profile}".\n`);
  }
}

async function authStatus(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values } = parseCommandArgs(args, {
    profile: { type: "string" },
    json: { type: "boolean" },
  });
  const resolved = await resolveProfile({
    env: dependencies.env,
    name: values.profile,
    path: dependencies.configPath,
  });
  const output = {
    profile: resolved.name,
    configured: resolved.apiKey !== null,
    credential_source: resolved.credentialSource,
    api_url: resolved.apiUrl,
    app_url: resolved.appUrl,
  };

  if (values.json) {
    writeJson(dependencies.stdout, output, true);
  } else {
    dependencies.stdout.write(
      resolved.apiKey
        ? `Profile "${resolved.name}" is configured (${resolved.credentialSource}).\n`
        : `Profile "${resolved.name}" is not configured.\n`,
    );
  }
}

async function listProfiles(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values } = parseCommandArgs(args, {
    json: { type: "boolean" },
  });
  const config = await readConfig(dependencies.configPath);
  const profiles = Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    active: name === config.active_profile,
    configured: true,
    api_url: profile.api_url,
    app_url: profile.app_url,
    ...(profile.key_id ? { key_id: profile.key_id } : {}),
    ...(profile.key_name ? { key_name: profile.key_name } : {}),
  }));

  if (values.json) {
    writeJson(dependencies.stdout, { profiles }, true);
  } else if (profiles.length === 0) {
    dependencies.stdout.write("No configured profiles.\n");
  } else {
    for (const profile of profiles) {
      dependencies.stdout.write(`${profile.active ? "*" : " "} ${profile.name}\n`);
    }
  }
}

async function useProfile(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values, positionals } = parseCommandArgs(args, {
    json: { type: "boolean" },
  });
  const requestedName = positionals[0]?.trim();

  if (!requestedName) {
    throw new CliError("PROFILE_NAME_REQUIRED", "A profile name is required.");
  }

  const name = profileName(requestedName);
  const config = await readConfig(dependencies.configPath);

  if (!config.profiles[name]) {
    throw new CliError("PROFILE_NOT_FOUND", `Profile "${name}" is not configured.`);
  }

  config.active_profile = name;
  await writeConfig(config, dependencies.configPath);

  if (values.json) {
    writeJson(dependencies.stdout, { ok: true, active_profile: name }, true);
  } else {
    dependencies.stdout.write(`Active profile: ${name}\n`);
  }
}

async function createContext(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values, positionals } = parseCommandArgs(args, {
    profile: { type: "string" },
    "api-url": { type: "string" },
    effort: { type: "string" },
    depth: { type: "string" },
    platform: { type: "string", multiple: true },
    source: { type: "string", multiple: true },
    "max-credits": { type: "string" },
    sync: { type: "boolean" },
    async: { type: "boolean" },
    wait: { type: "boolean" },
    "webhook-url": { type: "string" },
    metadata: { type: "string" },
    "idempotency-key": { type: "string" },
    "poll-interval-ms": { type: "string" },
    "timeout-ms": { type: "string" },
    json: { type: "boolean" },
  });
  const query = positionals.join(" ").trim();

  if (!query) {
    throw new CliError("QUERY_REQUIRED", "A context query is required.");
  }

  const profile = await requireProfile(values.profile, values["api-url"], dependencies);
  const effort = resolveEffort(values.effort, values.depth);
  const selectedPlatforms = parsePlatforms([
    ...stringValues(values.platform),
    ...stringValues(values.source),
  ]);
  const execution = resolveExecution(values.sync, values.async, values.wait);
  const input: ContextCreateInput = {
    query,
    ...(effort ? { effort } : {}),
    ...(values["max-credits"]
      ? { max_credits: positiveNumber(values["max-credits"], "max credits") }
      : {}),
    ...(selectedPlatforms.length > 0 ? { platforms: selectedPlatforms } : {}),
    ...execution,
    ...(values["webhook-url"] ? { webhook_url: validWebhookUrl(values["webhook-url"]) } : {}),
    ...(values.metadata ? { metadata: parseMetadata(values.metadata) } : {}),
  };
  const client = new SupaContext({
    apiKey: profile.apiKey,
    baseUrl: profile.apiUrl,
    fetch: dependencies.fetch,
  });
  const created = await client.context.create(input, {
    ...(values["idempotency-key"] ? { idempotencyKey: values["idempotency-key"] } : {}),
  });
  const result =
    values.wait && created.status === "queued"
      ? await client.context.poll(created.id, pollOptions(values))
      : created;

  writeJson(dependencies.stdout, result, !!values.json);
}

function resolveExecution(
  sync: boolean | undefined,
  async: boolean | undefined,
  wait: boolean | undefined,
): Pick<ContextCreateInput, "async"> {
  if (sync && (async || wait)) {
    throw new CliError(
      "CONFLICTING_OPTIONS",
      "--sync cannot be combined with --async or --wait.",
    );
  }

  if (sync) {
    return { async: false };
  }

  return async || wait ? { async: true } : {};
}

async function getContext(args: string[], dependencies: CliDependencies): Promise<void> {
  const { values, positionals } = parseCommandArgs(args, {
    profile: { type: "string" },
    "api-url": { type: "string" },
    wait: { type: "boolean" },
    "poll-interval-ms": { type: "string" },
    "timeout-ms": { type: "string" },
    json: { type: "boolean" },
  });
  const id = positionals[0]?.trim();

  if (!id) {
    throw new CliError("REQUEST_ID_REQUIRED", "A context request ID is required.");
  }

  const profile = await requireProfile(values.profile, values["api-url"], dependencies);
  const client = new SupaContext({
    apiKey: profile.apiKey,
    baseUrl: profile.apiUrl,
    fetch: dependencies.fetch,
  });
  const result = values.wait
    ? await client.context.poll(id, pollOptions(values))
    : await client.context.get(id);

  writeJson(dependencies.stdout, result, !!values.json);
}

async function requireProfile(
  name: string | undefined,
  apiUrl: string | undefined,
  dependencies: CliDependencies,
): Promise<{ apiKey: string; apiUrl: string }> {
  const profile = await resolveProfile({
    env: dependencies.env,
    name,
    path: dependencies.configPath,
  });

  if (!profile.apiKey) {
    throw new CliError(
      "API_KEY_REQUIRED",
      "No Supacontext API key is configured. Run `supacontext auth login` or `supacontext auth set-key`.",
    );
  }

  return {
    apiKey: profile.apiKey,
    apiUrl: apiUrl ? validUrl(apiUrl, "API URL") : profile.apiUrl,
  };
}

function pollOptions(values: Record<string, string | boolean | string[] | undefined>) {
  return {
    ...(values["poll-interval-ms"]
      ? { intervalMs: positiveInteger(values["poll-interval-ms"], "poll interval") }
      : {}),
    ...(values["timeout-ms"]
      ? { timeoutMs: positiveInteger(values["timeout-ms"], "timeout") }
      : {}),
  };
}

function parseCommandArgs<T extends ParseArgsConfig["options"]>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliError(
      "INVALID_ARGUMENT",
      error instanceof Error ? error.message : "Invalid command arguments.",
    );
  }
}

function profileName(value: string | undefined): string {
  const name = value?.trim() || "default";

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) {
    throw new CliError(
      "INVALID_PROFILE",
      "Profile names may contain letters, numbers, dots, underscores, and hyphens.",
    );
  }

  return name;
}

function normalizeEffort(value: string): ContextEffort {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");

  if (!efforts.includes(normalized as ContextEffort)) {
    throw new CliError("INVALID_EFFORT", `Unsupported effort/depth: ${value}`);
  }

  return normalized as ContextEffort;
}

function resolveEffort(
  effort: string | undefined,
  depth: string | undefined,
): ContextEffort | undefined {
  const normalizedEffort = effort ? normalizeEffort(effort) : undefined;
  const normalizedDepth = depth ? normalizeEffort(depth) : undefined;

  if (normalizedEffort && normalizedDepth && normalizedEffort !== normalizedDepth) {
    throw new CliError("CONFLICTING_OPTIONS", "--effort and --depth must select the same value.");
  }

  return normalizedEffort ?? normalizedDepth;
}

function normalizeKeyEffort(value: string) {
  const effort = normalizeEffort(value);

  if (!keyEfforts.includes(effort as (typeof keyEfforts)[number])) {
    throw new CliError("INVALID_EFFORT", "API key max effort cannot be auto.");
  }

  return effort as (typeof keyEfforts)[number];
}

function parsePlatforms(values: string[]): Platform[] {
  const selected = values
    .flatMap((value) => value.split(","))
    .map((value) =>
      value
        .trim()
        .toLowerCase()
        .replace(/^hacker[-_ ]news$/, "hackernews"),
    )
    .filter(Boolean);

  for (const value of selected) {
    if (!platforms.includes(value as Platform)) {
      throw new CliError("INVALID_SOURCE", `Unsupported source/platform: ${value}`);
    }
  }

  return [...new Set(selected)] as Platform[];
}

function stringValues(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parseMetadata(value: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CliError("INVALID_METADATA", "--metadata must be a JSON object.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("INVALID_METADATA", "--metadata must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseMonthlyLimit(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CliError(
      "INVALID_MONTHLY_LIMIT",
      "Monthly credit limit must be a non-negative whole number.",
    );
  }

  return parsed;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError("INVALID_ARGUMENT", `${label} must be a positive number.`);
  }

  return parsed;
}

function positiveInteger(value: string | boolean | string[], label: string): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError("INVALID_ARGUMENT", `${label} must be a positive whole number.`);
  }

  return parsed;
}

function validUrl(value: string, label: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new CliError("INVALID_URL", `${label} must be a valid HTTP or HTTPS URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError("INVALID_URL", `${label} must be a valid HTTP or HTTPS URL.`);
  }

  return url.toString().replace(/\/$/, "");
}

function validWebhookUrl(value: string): string {
  const url = validUrl(value, "webhook URL");

  if (new URL(url).protocol !== "https:") {
    throw new CliError("INVALID_URL", "webhook URL must use HTTPS.");
  }

  return url;
}

function assertApiKey(value: string): void {
  if (!/^sk_sc_[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new CliError("INVALID_API_KEY", "The Supacontext API key format is invalid.");
  }
}

function publicKey(key: DashboardApiKey) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    max_effort: key.maxEffort,
    monthly_credit_limit: key.monthlyCreditLimit,
    created_at: key.createdAt,
  };
}

async function question(dependencies: CliDependencies, prompt: string): Promise<string> {
  const readline = createInterface({
    input: dependencies.stdin,
    output: dependencies.stdout,
  });

  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}

async function readSecret(dependencies: CliDependencies, prompt: string): Promise<string> {
  const input = dependencies.stdin;

  if (!input.isTTY) {
    return readSecretFromPipe(input);
  }

  if (!input.setRawMode) {
    throw new CliError(
      "SECRET_INPUT_UNAVAILABLE",
      "This terminal cannot mask secret input. Pipe the API key to `supacontext auth set-key` instead.",
    );
  }

  dependencies.stdout.write(prompt);

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw ?? false;

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode?.(wasRaw);
      input.pause();
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\r" || character === "\n") {
          cleanup();
          dependencies.stdout.write("\n");
          resolve(value.trim());
          return;
        }

        if (character === "\u0003") {
          cleanup();
          dependencies.stdout.write("\n");
          reject(new CliError("CANCELLED", "Input cancelled."));
          return;
        }

        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            dependencies.stdout.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          value += character;
          dependencies.stdout.write("*");
        }
      }
    };

    input.setRawMode?.(true);
    input.resume();
    input.on("data", onData);
  });
}

async function readSecretFromPipe(input: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));

    size += buffer.length;
    if (size > 4_096) {
      throw new CliError("INVALID_API_KEY", "API key input is too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

function writeJson(output: Writable, value: unknown, compact: boolean): void {
  output.write(`${JSON.stringify(value, null, compact ? undefined : 2)}\n`);
}

export function formatCliError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof CliError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  if (error instanceof SupaContextError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Unexpected CLI error.",
  };
}

async function openBrowser(url: string): Promise<boolean> {
  const command =
    process.platform === "win32" ? "rundll32" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

const helpText = `Supacontext CLI

Usage:
  supacontext auth login [--profile <name>] [--create-key <name>] [--json]
  supacontext auth set-key [--profile <name>] [--key-stdin] [--json]
  supacontext auth status [--profile <name>] [--json]
  supacontext profile list [--json]
  supacontext profile use <name> [--json]
  supacontext context create <query> [options]
  supacontext context get <request-id> [--wait] [--json]

Context options:
  --effort, --depth <low|medium|high|x_high|auto>
  --platform, --source <name>   Repeat or use a comma-separated list
  --max-credits <number>
  --sync                       Run inline and return the completed result (default)
  --async                      Queue the run and return its request ID
  --wait                       Submit asynchronously and poll to completion
  --webhook-url <https-url>
  --metadata <json-object>
  --idempotency-key <value>
  --json                       Emit compact, stable JSON

Sources:
  web, reddit, x, youtube, facebook, news, forums, places, linkedin,
  hackernews, github
`;
