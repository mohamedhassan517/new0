import type { RequestHandler } from "express";
import type {
  ApiError,
  Role,
  User,
  UserCreateRequest,
  UserUpdateRequest,
  UsersListResponse,
} from "@shared/api";
import { extractToken } from "./auth";
import {
  requireManager,
  listUsers as listUsersFallback,
  createUser as createUserFallback,
  updateUser as updateUserFallback,
  deleteUser as deleteUserFallback,
} from "../store/auth";
import { parseBody } from "../utils/parse-body";

export const adminListUsers: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const users = await listUsersFallback();
  return res.json({ users } as UsersListResponse);
};

export const adminCreateUser: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const raw = parseBody<Partial<UserCreateRequest> & Record<string, any>>(
    req.body,
  );
  const email = String((raw as any).email ?? (raw as any).gmail ?? "").trim();
  const password = String((raw as any).password ?? "").trim();
  const roleInput = String((raw as any).role ?? "employee");
  const roleMap: Record<string, Role> = {
    manager: "manager",
    accountant: "accountant",
    employee: "employee",
    مدير: "manager",
    محاسب: "accountant",
    موظف: "employee",
  };
  const role = (roleMap[roleInput] ?? "employee") as Role;
  const active = typeof raw.active === "boolean" ? raw.active : true;
  let name = String((raw as any).name ?? (raw as any).username ?? "").trim();
  if (!name && email) name = email.split("@")[0];
  let username = String((raw as any).username ?? "").trim();
  if (!username) username = name;

  if (!email || !password || !username) {
    const missing = [
      !email ? "email" : null,
      !password ? "password" : null,
      !username ? "username/name" : null,
    ].filter(Boolean);
    return res
      .status(400)
      .json({ error: `Missing fields: ${missing.join(", ")}` } as ApiError);
  }

  try {
    const user = await createUserFallback({
      username,
      name,
      email,
      role,
      password,
      active,
    });
    return res.status(201).json(user);
  } catch (error: any) {
    const code =
      typeof error === "object" && error ? (error as any).code : undefined;
    if (code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Username or email already exists" } as ApiError);
    }
    return res.status(500).json({ error: "Failed to create user" } as ApiError);
  }
};

export const adminUpdateUser: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const id = req.params.id;
  const patch = parseBody<Record<string, unknown>>(
    req.body,
  ) as UserUpdateRequest & {
    password?: string;
    email?: string;
    name?: string;
  };

  try {
    const updated = await updateUserFallback(id, patch as any);
    if (!updated)
      return res.status(404).json({ error: "User not found" } as ApiError);
    return res.json(updated);
  } catch (error: any) {
    const code =
      typeof error === "object" && error ? (error as any).code : undefined;
    if (code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Username or email already exists" } as ApiError);
    }
    return res.status(500).json({ error: "Failed to update user" } as ApiError);
  }
};

export const adminDeleteUser: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) return res.status(403).json({ error: "Forbidden" } as ApiError);

  const id = req.params.id;
  const ok = await deleteUserFallback(id);
  if (!ok) return res.status(404).json({ error: "User not found" } as ApiError);
  return res.status(204).end();
};
