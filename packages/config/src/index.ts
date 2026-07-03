import { z } from "zod";

const nodeEnv = z.enum(["development", "test", "production"]).default("development");
const requiredString = z.string().trim().min(1, "is required");
const requiredUrl = z.string().trim().url();
const port = z.coerce.number().int().positive();
const logLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info");

const sharedSchema = {
  NODE_ENV: nodeEnv,
  APP_URL: requiredUrl,
  API_URL: requiredUrl,
  WORKER_URL: requiredUrl,
  DATABASE_URL: requiredString,
  API_KEY_HASH_SECRET: requiredString.min(32, "must be at least 32 characters"),
};

const supabaseSchema = {
  SUPABASE_URL: requiredUrl,
  SUPABASE_ANON_KEY: requiredString,
  SUPABASE_SERVICE_ROLE_KEY: requiredString,
};

const clerkSchema = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: requiredString,
  CLERK_SECRET_KEY: requiredString,
  CLERK_WEBHOOK_SECRET: requiredString,
};

const creemSchema = {
  CREEM_API_KEY: requiredString,
  CREEM_WEBHOOK_SECRET: requiredString,
};

const upstashSchema = {
  UPSTASH_REDIS_REST_URL: requiredUrl,
  UPSTASH_REDIS_REST_TOKEN: requiredString,
  QSTASH_TOKEN: requiredString,
  QSTASH_CURRENT_SIGNING_KEY: requiredString,
  QSTASH_NEXT_SIGNING_KEY: requiredString,
};

const providerSchema = {
  EXA_API_KEY: requiredString,
  FETCHLAYER_API_KEY: requiredString,
  XQUIK_API_KEY: requiredString,
  SUPADATA_API_KEY: requiredString,
  DEEPSEEK_API_KEY: requiredString,
  VOYAGE_API_KEY: requiredString,
};

export const apiEnvSchema = z.object({
  ...sharedSchema,
  ...supabaseSchema,
  ...creemSchema,
  ...upstashSchema,
  PORT: port.default(3001),
  LOG_LEVEL: logLevel,
});

export const workerEnvSchema = z.object({
  ...sharedSchema,
  ...supabaseSchema,
  ...upstashSchema,
  ...providerSchema,
  WORKER_PORT: port.default(3002),
  LOG_LEVEL: logLevel,
});

export const webEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  APP_URL: requiredUrl,
  API_URL: requiredUrl,
  ...clerkSchema,
  SUPABASE_URL: requiredUrl,
  SUPABASE_ANON_KEY: requiredString,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

function formatEnvError(error: z.ZodError): string {
  const messages = error.issues.map((issue) => {
    const key = issue.path.join(".") || "environment";
    return `- ${key}: ${issue.message}`;
  });

  return ["Invalid environment configuration:", ...messages].join("\n");
}

export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error));
  }

  return parsed.data;
}

export function getApiEnv(source?: NodeJS.ProcessEnv): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}

export function getWorkerEnv(source?: NodeJS.ProcessEnv): WorkerEnv {
  return parseEnv(workerEnvSchema, source);
}

export function getWebEnv(source?: NodeJS.ProcessEnv): WebEnv {
  return parseEnv(webEnvSchema, source);
}

