import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import type {
  Database as SqliteDatabase,
  RunResult as SqliteRunResult,
} from "better-sqlite3";

const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = Number(process.env.MYSQL_PORT ?? "3306");
const MYSQL_DATABASE = process.env.MYSQL_DATABASE;
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD ?? undefined;

const DEFAULT_DB_FILENAME = "app.db";

let mysqlPool: Pool | null = null;
let sqlitePool: SqlitePool | null = null;
let sqliteDb: SqliteDatabase | null = null;
let initializationPromise: Promise<boolean> | null = null;

export interface SqliteQueryHeader {
  affectedRows: number;
  insertId: number;
}

export interface SqliteConnection {
  readonly isSqlite: true;
  query<T = RowDataPacket[] | SqliteQueryHeader>(
    sql: string,
    params?: unknown[],
  ): Promise<[T, SqliteQueryHeader]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface SqlitePool {
  readonly isSqlite: true;
  query<T = RowDataPacket[] | SqliteQueryHeader>(
    sql: string,
    params?: unknown[],
  ): Promise<[T, SqliteQueryHeader]>;
  getConnection(): Promise<SqliteConnection>;
}

export type DatabasePool = Pool | SqlitePool;
export type DatabaseConnection = PoolConnection | SqliteConnection;

function hasMysqlConfig() {
  return Boolean(MYSQL_HOST && MYSQL_DATABASE && MYSQL_USER);
}

function resolveDefaultDataDir() {
  if (process.env.LOCAL_DB_DIR) {
    return path.resolve(process.env.LOCAL_DB_DIR);
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR, "data");
  }
  return path.resolve(process.cwd(), "data");
}

function resolveLocalDbPath() {
  const explicit = process.env.LOCAL_DB_PATH;
  if (explicit) return path.resolve(explicit);
  const baseDir = resolveDefaultDataDir();
  return path.join(baseDir, DEFAULT_DB_FILENAME);
}

function ensureDirectoryExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

class BetterSqlitePool implements SqlitePool {
  readonly isSqlite = true as const;

  constructor(private readonly db: SqliteDatabase) {}

  async query<T = RowDataPacket[] | SqliteQueryHeader>(
    sql: string,
    params: unknown[] = [],
  ): Promise<[T, SqliteQueryHeader]> {
    const trimmed = sql.trim().toUpperCase();
    const statement = this.db.prepare(sql);
    if (
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("WITH") ||
      trimmed.startsWith("PRAGMA")
    ) {
      const rows = statement.all(params) as T;
      return [rows, { affectedRows: 0, insertId: 0 }];
    }
    const result = statement.run(params) as SqliteRunResult;
    const header: SqliteQueryHeader = {
      affectedRows: result.changes ?? 0,
      insertId: Number(result.lastInsertRowid ?? 0),
    };
    return [header as T, header];
  }

  async getConnection(): Promise<SqliteConnection> {
    return new BetterSqliteConnection(this.db);
  }
}

class BetterSqliteConnection implements SqliteConnection {
  readonly isSqlite = true as const;
  private inTransaction = false;

  constructor(private readonly db: SqliteDatabase) {}

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    this.db.prepare("BEGIN IMMEDIATE").run();
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) return;
    this.db.prepare("COMMIT").run();
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) return;
    try {
      this.db.prepare("ROLLBACK").run();
    } finally {
      this.inTransaction = false;
    }
  }

  async query<T = RowDataPacket[] | SqliteQueryHeader>(
    sql: string,
    params: unknown[] = [],
  ): Promise<[T, SqliteQueryHeader]> {
    const trimmed = sql.trim().toUpperCase();
    const statement = this.db.prepare(sql);
    if (
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("WITH") ||
      trimmed.startsWith("PRAGMA")
    ) {
      const rows = statement.all(params) as T;
      return [rows, { affectedRows: 0, insertId: 0 }];
    }
    const result = statement.run(params) as SqliteRunResult;
    const header: SqliteQueryHeader = {
      affectedRows: result.changes ?? 0,
      insertId: Number(result.lastInsertRowid ?? 0),
    };
    return [header as T, header];
  }

  release(): void {
    if (this.inTransaction) {
      try {
        this.db.prepare("ROLLBACK").run();
      } catch {
        // ignore rollback errors on release
      }
      this.inTransaction = false;
    }
  }
}

function ensureSqlitePool(): SqlitePool {
  if (sqlitePool) return sqlitePool;
  const dbPath = resolveLocalDbPath();
  ensureDirectoryExists(dbPath);
  if (!sqliteDb) {
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
  }
  sqlitePool = new BetterSqlitePool(sqliteDb);
  return sqlitePool;
}

function getSqliteDb(): SqliteDatabase {
  if (!sqliteDb) {
    ensureSqlitePool();
  }
  if (!sqliteDb) {
    throw new Error("SQLite database not initialized");
  }
  return sqliteDb;
}

function ensureSqliteSchema(db: SqliteDatabase) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('manager','accountant','employee')),
      active INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('revenue','expense')),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      min REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('in','out')),
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NULL,
      party TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      floors INTEGER NOT NULL DEFAULT 0,
      units INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS project_costs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS project_sales (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      unit_no TEXT NOT NULL,
      buyer TEXT NOT NULL,
      price REAL NOT NULL,
      date TEXT NOT NULL,
      terms TEXT NULL,
      area TEXT NULL,
      payment_method TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS project_installments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sale_id TEXT NOT NULL,
      unit_no TEXT NULL,
      buyer TEXT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (sale_id) REFERENCES project_sales(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS installment_reminders (
      id TEXT PRIMARY KEY,
      installment_id TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note TEXT NULL,
      FOREIGN KEY (installment_id) REFERENCES project_installments(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON inventory_movements(item_id, date, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)`,
    `CREATE INDEX IF NOT EXISTS idx_project_costs_project_date ON project_costs(project_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_project_sales_project_date ON project_sales(project_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_project_installments_project_date ON project_installments(project_id, due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_project_installments_sale ON project_installments(sale_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_installments_paid ON project_installments(paid)`,
  ];

  for (const statement of statements) {
    db.prepare(statement).run();
  }
}

async function seedSqliteManager(pool: SqlitePool) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM users WHERE username = ? LIMIT 1`,
    ["root"],
  );
  if (Array.isArray(rows) && rows.length > 0) return;

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("password123", 10);
  await pool.query(
    `INSERT INTO users (id, username, name, email, role, active, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, "root", "Manager", "admin@example.com", "manager", 1, passwordHash],
  );
}

async function ensureMysqlSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(191) NOT NULL,
      email VARCHAR(191) NOT NULL,
      role ENUM('manager','accountant','employee') NOT NULL DEFAULT 'employee',
      active TINYINT(1) NOT NULL DEFAULT 1,
      password_hash VARCHAR(191) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token CHAR(36) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id CHAR(36) NOT NULL PRIMARY KEY,
      date DATE NOT NULL,
      type ENUM('revenue','expense') NOT NULL,
      description TEXT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      approved TINYINT(1) NOT NULL DEFAULT 0,
      created_by CHAR(36) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_transactions_date (date, created_at),
      INDEX idx_transactions_type (type),
      INDEX idx_transactions_created_by (created_by),
      CONSTRAINT fk_transactions_user FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id CHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
      unit VARCHAR(64) NOT NULL,
      min DECIMAL(12,2) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inventory_items_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id CHAR(36) NOT NULL PRIMARY KEY,
      item_id CHAR(36) NOT NULL,
      kind ENUM('in','out') NOT NULL,
      qty DECIMAL(12,2) NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      total DECIMAL(12,2) NULL,
      party VARCHAR(191) NOT NULL,
      date DATE NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inventory_movements_item_date (item_id, date, created_at),
      CONSTRAINT fk_inventory_movements_item FOREIGN KEY (item_id)
        REFERENCES inventory_items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id CHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      location VARCHAR(191) NOT NULL,
      floors INT NOT NULL DEFAULT 0,
      units INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_projects_created_at (created_at),
      INDEX idx_projects_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_costs (
      id CHAR(36) NOT NULL PRIMARY KEY,
      project_id CHAR(36) NOT NULL,
      type ENUM('construction','operation','expense','other') NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      date DATE NOT NULL,
      note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_project_costs_project_date (project_id, date),
      CONSTRAINT fk_project_costs_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_sales (
      id CHAR(36) NOT NULL PRIMARY KEY,
      project_id CHAR(36) NOT NULL,
      unit_no VARCHAR(191) NOT NULL,
      buyer VARCHAR(191) NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      date DATE NOT NULL,
      terms TEXT NULL,
      area VARCHAR(191) NULL,
      payment_method VARCHAR(191) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_project_sales_project_date (project_id, date),
      CONSTRAINT fk_project_sales_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_installments (
      id CHAR(36) NOT NULL PRIMARY KEY,
      project_id CHAR(36) NOT NULL,
      sale_id CHAR(36) NOT NULL,
      unit_no VARCHAR(191) NULL,
      buyer VARCHAR(191) NULL,
      amount DECIMAL(12,2) NOT NULL,
      due_date DATE NOT NULL,
      paid TINYINT(1) NOT NULL DEFAULT 0,
      paid_at DATE NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_project_installments_project_date (project_id, due_date),
      INDEX idx_project_installments_sale (sale_id),
      INDEX idx_project_installments_paid (paid),
      CONSTRAINT fk_project_installments_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_project_installments_sale FOREIGN KEY (sale_id)
        REFERENCES project_sales(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS installment_reminders (
      id CHAR(36) NOT NULL PRIMARY KEY,
      installment_id CHAR(36) NOT NULL,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note VARCHAR(255) NULL,
      CONSTRAINT fk_installment_reminders_installment FOREIGN KEY (installment_id)
        REFERENCES project_installments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function seedMysqlManager(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM users WHERE username = ? LIMIT 1",
    ["root"],
  );
  if (Array.isArray(rows) && rows.length > 0) return;

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("password123", 10);
  await pool.query(
    `INSERT INTO users (id, username, name, email, role, active, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, "root", "Manager", "admin@example.com", "manager", 1, passwordHash],
  );
}

export function isSqlitePool(value: unknown): value is SqlitePool {
  return Boolean(
    value && typeof value === "object" && (value as SqlitePool).isSqlite,
  );
}

export function getMysqlPool(): DatabasePool | null {
  if (hasMysqlConfig()) {
    if (!mysqlPool) {
      mysqlPool = mysql.createPool({
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        database: MYSQL_DATABASE,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true,
        charset: "utf8mb4_general_ci",
      });
    }
    return mysqlPool;
  }

  try {
    return ensureSqlitePool();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[sqlite] failed to create pool", error);
    return null;
  }
}

export function isMysqlConfigured() {
  if (hasMysqlConfig()) return true;
  try {
    ensureSqlitePool();
    return true;
  } catch {
    return false;
  }
}

export async function initializeMysql() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (hasMysqlConfig()) {
        try {
          const pool = getMysqlPool();
          if (!pool || isSqlitePool(pool)) return false;
          await ensureMysqlSchema(pool);
          await seedMysqlManager(pool);
          return true;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[mysql] initialization failed", error);
          return false;
        }
      }

      try {
        const pool = ensureSqlitePool();
        const db = getSqliteDb();
        ensureSqliteSchema(db);
        await seedSqliteManager(pool);
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[sqlite] initialization failed", error);
        return false;
      }
    })();
  }
  return initializationPromise;
}

export async function getInitializedMysqlPool(): Promise<DatabasePool | null> {
  const ready = await initializeMysql();
  if (!ready) return null;
  return getMysqlPool();
}
