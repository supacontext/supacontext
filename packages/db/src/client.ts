import postgres from "postgres";

export type DatabaseClient = postgres.Sql;

export type DatabaseClientOptions = {
  url: string;
  maxConnections?: number;
};

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  return postgres(options.url, {
    max: options.maxConnections ?? 5,
    prepare: false,
  });
}
