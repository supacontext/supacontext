import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, posix, win32 } from "node:path";

export const DEFAULT_APP_URL = "https://supacontext.ai";
export const DEFAULT_API_URL = "https://api.supacontext.ai";
export const DEFAULT_PROFILE = "default";

export type StoredProfile = {
  api_key: string;
  api_url: string;
  app_url: string;
  key_id?: string;
  key_name?: string;
};

export type CliConfig = {
  version: 1;
  active_profile: string;
  profiles: Record<string, StoredProfile>;
};

export type ResolvedProfile = {
  name: string;
  apiKey: string | null;
  apiUrl: string;
  appUrl: string;
  credentialSource: "environment" | "config" | "none";
};

export function getConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  const path = platform === "win32" ? win32 : posix;

  if (env.SUPACONTEXT_CONFIG_DIR) {
    return path.join(env.SUPACONTEXT_CONFIG_DIR, "config.json");
  }

  if (platform === "win32") {
    return path.join(
      env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "supacontext",
      "config.json",
    );
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "supacontext", "config.json");
  }

  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "supacontext", "config.json");
}

export function emptyConfig(): CliConfig {
  return {
    version: 1,
    active_profile: DEFAULT_PROFILE,
    profiles: {},
  };
}

export async function readConfig(path = getConfigPath()): Promise<CliConfig> {
  let value: unknown;

  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyConfig();
    }

    throw new Error(`Could not read Supacontext configuration at ${path}.`);
  }

  if (!isConfig(value)) {
    throw new Error(`Supacontext configuration at ${path} is invalid.`);
  }

  return value;
}

export async function writeConfig(config: CliConfig, path = getConfigPath()): Promise<void> {
  const directory = dirname(path);

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);

  const file = await open(path, "w", 0o600);

  try {
    await file.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
  } finally {
    await file.close();
  }

  await chmod(path, 0o600).catch(() => undefined);
}

export async function saveProfile(
  name: string,
  profile: StoredProfile,
  path = getConfigPath(),
): Promise<void> {
  const config = await readConfig(path);

  config.active_profile = name;
  config.profiles[name] = profile;
  await writeConfig(config, path);
}

export async function resolveProfile(
  input: {
    env?: NodeJS.ProcessEnv;
    name?: string | undefined;
    path?: string;
  } = {},
): Promise<ResolvedProfile> {
  const env = input.env ?? process.env;
  const config = await readConfig(input.path);
  const name = input.name ?? env.SUPACONTEXT_PROFILE ?? config.active_profile;
  const stored = config.profiles[name];
  const environmentKey = env.SUPACONTEXT_API_KEY?.trim();

  return {
    name,
    apiKey: environmentKey || stored?.api_key || null,
    apiUrl: (env.SUPACONTEXT_API_URL || stored?.api_url || DEFAULT_API_URL).replace(/\/$/, ""),
    appUrl: (env.SUPACONTEXT_APP_URL || stored?.app_url || DEFAULT_APP_URL).replace(/\/$/, ""),
    credentialSource: environmentKey ? "environment" : stored ? "config" : "none",
  };
}

function isConfig(value: unknown): value is CliConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CliConfig>;

  if (
    candidate.version !== 1 ||
    typeof candidate.active_profile !== "string" ||
    !candidate.profiles ||
    typeof candidate.profiles !== "object"
  ) {
    return false;
  }

  return Object.values(candidate.profiles).every(
    (profile) =>
      profile &&
      typeof profile.api_key === "string" &&
      typeof profile.api_url === "string" &&
      typeof profile.app_url === "string" &&
      (profile.key_id === undefined || typeof profile.key_id === "string") &&
      (profile.key_name === undefined || typeof profile.key_name === "string"),
  );
}
