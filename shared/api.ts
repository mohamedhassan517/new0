/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

export type Role = "manager" | "accountant" | "employee";

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface UserWithPassword extends User {
  password: string;
}

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AuthLoginResponse {
  token: string;
  user: User;
}

export interface AuthMeResponse {
  user: User | null;
}

export interface ApiError {
  error: string;
}

export interface UserCreateRequest {
  username: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  active?: boolean;
}

export interface UserUpdateRequest {
  name?: string;
  email?: string;
  role?: Role;
  password?: string;
  active?: boolean;
}

export interface UsersListResponse {
  users: User[];
}
