import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import type { D1Like, D1Prepared } from "@/server/env";
import migration from "../../../migrations/0001_init.sql?raw";

class SQLitePrepared implements D1Prepared {
  constructor(
    private readonly statement: StatementSync,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new SQLitePrepared(this.statement, values as SQLInputValue[]);
  }

  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }

  async run() {
    return this.execute();
  }

  execute() {
    return { meta: { changes: Number(this.statement.run(...this.values).changes) } };
  }
}

export function createSQLiteD1(revision: number) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  sqlite.exec("INSERT INTO app_meta (key, value) VALUES ('seeded', '1')");
  sqlite.prepare("INSERT INTO app_meta (key, value) VALUES ('revision', ?)").run(String(revision));

  const db: D1Like = {
    prepare(sql) {
      return new SQLitePrepared(sqlite.prepare(sql));
    },
    async batch(statements: SQLitePrepared[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return { db, close: () => sqlite.close() };
}
