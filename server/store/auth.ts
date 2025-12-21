import crypto from "node:crypto";
import type { Role, User, UserWithPassword } from "@shared/api";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import { getInitializedMysqlPool, isMysqlConfigured } from "../lib/mysql";

// In-memory stores (non-persistent) - fallback when external persistence is missing
const fallbackUsers = new Map<string, UserWithPassword>();
const fallbackSessions = new Map<string, string>(); // token -> userId

function seedFallback() {
  if (fallbackUsers.size === 0) {
    const id = crypto.randomUUID();
    const manager: UserWithPassword = {
      id,
      username: "root",
      name: "Manager",
      email: "admin@example.com",
      role: "manager",
      active: true,
      password: "password123",
    };
    fallbackUsers.set(id, manager);
  }
}
seedFallback();

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  active: number | boolean;
};

type UserWithPasswordRow = UserRow & {
  password_hash: string;
};

function asBoolean(value: number | boolean) {
  return typeof value === "number" ? value === 1 : Boolean(value);
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    active: asBoolean(row.active),
  };
}

export async function authenticate(username: string, password: string) {
  const pool = await getInitializedMysqlPool();
  if (pool) {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, username, name, email, role, active, password_hash
         FROM users
         WHERE username = ?
         LIMIT 1`,
        [username],
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0] as UserWithPasswordRow;
        if (!asBoolean(row.active)) return null;
        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;
        const token = crypto.randomUUID();
        await pool.query(
          `INSERT INTO sessions (token, user_id) VALUES (?, ?)`,
          [token, row.id],
        );
        return { token, user: mapUser(row) } as { token: string; user: User };
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[mysql] authenticate failed", error);
    }
  }

  for (const user of fallbackUsers.values()) {
    if (
      user.username === username &&
      user.password === password &&
      user.active
    ) {
      const token = crypto.randomUUID();
      fallbackSessions.set(token, user.id);
      const { password: _pw, ...safe } = user;
      return { token, user: safe } as { token: string; user: User };
    }
  }
  return null;
}

export async function getUserByTokenAsync(
  token?: string | null,
): Promise<User | null> {
  if (!token) return null;

  const pool = await getInitializedMysqlPool();
  if (pool) {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT u.id, u.username, u.name, u.email, u.role, u.active
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
         LIMIT 1`,
        [token],
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0] as UserRow;
        return mapUser(row);
      }
      return null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[mysql] getUserByTokenAsync failed", error);
      return null;
    }
  }

  const userId = fallbackSessions.get(token);
  if (!userId) return null;
  const user = fallbackUsers.get(userId);
  if (!user) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}

export function getUserByToken(token?: string | null): User | null {
  if (isMysqlConfigured()) return null;
  if (!token) return null;
  const userId = fallbackSessions.get(token);
  if (!userId) return null;
  const user = fallbackUsers.get(userId);
  if (!user) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}

export async function invalidateTokenAsync(token: string) {
  if (!token) return;
  const pool = await getInitializedMysqlPool();
  if (pool) {
    try {
      await pool.query(`DELETE FROM sessions WHERE token = ?`, [token]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[mysql] invalidateTokenAsync failed", error);
    }
    return;
  }
  fallbackSessions.delete(token);
}

export function invalidateToken(token: string) {
  fallbackSessions.delete(token);
  if (!token) return;
  if (isMysqlConfigured()) {
    void invalidateTokenAsync(token);
  }
}

export async function requireManager(
  token?: string | null,
): Promise<User | null> {
  const user = await getUserByTokenAsync(token ?? null);
  if (!user) return null;
  if (user.role !== "manager" || !user.active) return null;
  return user;
}

export async function listUsers(): Promise<User[]> {
  const pool = await getInitializedMysqlPool();
  if (pool) {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, username, name, email, role, active FROM users ORDER BY created_at DESC`,
      );
      return (rows as UserRow[]).map(mapUser);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[mysql] listUsers failed", error);
    }
  }
  return Array.from(fallbackUsers.values()).map(({ password: _pw, ...u }) => u);
}

export async function createUser(input: {
  username: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  active?: boolean;
}): Promise<User> {
  const pool = await getInitializedMysqlPool();
  if (pool) {
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 10);
    const active = input.active ?? true;
    try {
      await pool.query(
        `INSERT INTO users (id, username, name, email, role, active, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.username,
          input.name,
          input.email,
          input.role,
          active ? 1 : 0,
          passwordHash,
        ],
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[mysql] createUser failed", error);
      throw error;
    }
    return {
      id,
      username: input.username,
      name: input.name,
      email: input.email,
      role: input.role,
      active,
    } satisfies User;
  }

  const id = crypto.randomUUID();
  const user: UserWithPassword = {
    id,
    username: input.username,
    name: input.name,
    email: input.email,
    role: input.role,
    active: input.active ?? true,
    password: input.password,
  };
  fallbackUsers.set(id, user);
  const { password: _pw, ...safe } = user;
  return safe;
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<UserWithPassword, "id" | "username">> & {
    password?: string;
  },
): Promise<User | null> {
  const pool = await getInitializedMysqlPool();
  if (pool) {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (patch.name !== undefined) {
      updates.push("name = ?");
      params.push(patch.name);
    }
    if (patch.email !== undefined) {
      updates.push("email = ?");
      params.push(patch.email);
    }
    if (patch.role !== undefined) {
      updates.push("role = ?");
      params.push(patch.role);
    }
    if (typeof patch.active === "boolean") {
      updates.push("active = ?");
      params.push(patch.active ? 1 : 0);
    }
    if (patch.password) {
      const passwordHash = await bcrypt.hash(patch.password, 10);
      updates.push("password_hash = ?");
      params.push(passwordHash);
    }

    if (updates.length) {
      params.push(id);
      try {
        const [result] = await pool.query(
          `UPDATE users SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          params,
        );
        const { affectedRows } = result as { affectedRows?: number };
        if (!affectedRows) return null;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[mysql] updateUser failed", error);
        throw error;
      }
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, name, email, role, active FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return mapUser(rows[0] as UserRow);
  }

  const existing = fallbackUsers.get(id);
  if (!existing) return null;
  const updated: UserWithPassword = {
    ...existing,
    ...patch,
  };
  fallbackUsers.set(id, updated);
  const { password: _pw, ...safe } = updated;
  return safe as User;
}

export async function deleteUser(id: string): Promise<boolean> {
  const pool = await getInitializedMysqlPool();
  if (pool) {
    try {
      const [result] = await pool.query(`DELETE FROM users WHERE id = ?`, [id]);
      const { affectedRows } = result as { affectedRows?: number };
      return Boolean(affectedRows);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[mysql] deleteUser failed", error);
      throw error;
    }
  }
  return fallbackUsers.delete(id);
}
