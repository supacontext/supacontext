import postgres from "postgres";

export type DatabaseClient = postgres.Sql;

export type DatabaseClientOptions = {
  url: string;
  maxConnections?: number;
};

function hasSslMode(url: string): boolean {
  return new URL(url).searchParams.has("sslmode");
}

function isLocalDatabaseUrl(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const connectionOptions: postgres.Options<Record<string, postgres.PostgresType>> = {
    max: options.maxConnections ?? 5,
    prepare: false,
    connection: {
      statement_timeout: 30_000,
    },
  };

  if (!hasSslMode(options.url) && !isLocalDatabaseUrl(options.url)) {
    connectionOptions.ssl = "require";
  }

  return postgres(options.url, connectionOptions);
}
