import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Like, D1Prepared, D1Result } from "@/server/env";

class SQLiteStatement implements D1Prepared {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: SQLInputValue[]) {
    return new SQLiteStatement(this.db, this.sql, values);
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }

  async run() {
    return this.execute();
  }

  execute(): D1Result {
    const statement = this.db.prepare(this.sql);
    const writes = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(this.sql);
    const results = statement.all(...this.values);
    const changes = writes ? Number(this.db.prepare("SELECT changes() AS n").get()?.["n"]) : 0;
    return { results, meta: { changes } };
  }
}

export class SQLiteD1 implements D1Like {
  readonly db = new DatabaseSync(":memory:");

  prepare(sql: string) {
    return new SQLiteStatement(this.db, sql);
  }

  async batch(statements: SQLiteStatement[]) {
    this.db.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
