import type { RequestHandler } from "express";
import {
  createUser,
  deleteUser,
  listUsers,
  requireManager,
  updateUser,
} from "../store/auth";
import type {
  ApiError,
  UserCreateRequest,
  UserUpdateRequest,
  UsersListResponse,
} from "@shared/api";
import { extractToken } from "./auth";
import { parseBody } from "../utils/parse-body";

export const listUsersHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const users = await listUsers();
  res.json({ users } as UsersListResponse);
};

export const createUserHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as UserCreateRequest;
  if (
    !body.username ||
    !body.password ||
    !body.name ||
    !body.email ||
    !body.role
  ) {
    res.status(400).json({ error: "Missing required fields" } as ApiError);
    return;
  }
  try {
    const user = await createUser(body);
    res.status(201).json(user);
  } catch (error: any) {
    const code =
      typeof error === "object" && error ? (error as any).code : undefined;
    if (code === "ER_DUP_ENTRY") {
      res
        .status(409)
        .json({ error: "Username or email already exists" } as ApiError);
      return;
    }
    res.status(500).json({ error: "Failed to create user" } as ApiError);
  }
};

export const updateUserHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const id = req.params.id;
  const patch = parseBody<Record<string, unknown>>(
    req.body,
  ) as UserUpdateRequest;
  try {
    const updated = await updateUser(id, patch);
    if (!updated) {
      res.status(404).json({ error: "User not found" } as ApiError);
      return;
    }
    res.json(updated);
  } catch (error: any) {
    const code =
      typeof error === "object" && error ? (error as any).code : undefined;
    if (code === "ER_DUP_ENTRY") {
      res
        .status(409)
        .json({ error: "Username or email already exists" } as ApiError);
      return;
    }
    res.status(500).json({ error: "Failed to update user" } as ApiError);
  }
};

export const deleteUserHandler: RequestHandler = async (req, res) => {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  const manager = await requireManager(token);
  if (!manager) {
    res.status(403).json({ error: "Forbidden" } as ApiError);
    return;
  }
  const id = req.params.id;
  try {
    const ok = await deleteUser(id);
    if (!ok) {
      res.status(404).json({ error: "User not found" } as ApiError);
      return;
    }
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" } as ApiError);
  }
};
