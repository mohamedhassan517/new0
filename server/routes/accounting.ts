import type { RequestHandler } from "express";
import type { ApiError, User } from "@shared/api";
import {
  type AccountingSnapshot,
  type InventoryIssueInput,
  type InventoryItem,
  type InventoryItemCreateInput,
  type InventoryMovementResult,
  type InventoryReceiptInput,
  type Project,
  type ProjectCostCreateInput,
  type ProjectCostCreateResult,
  type ProjectCreateInput,
  type ProjectSaleCreateInput,
  type ProjectSaleCreateResult,
  type Transaction,
  type TransactionCreateInput,
} from "@shared/accounting";
import { type Installment } from "@shared/accounting";
import { extractToken } from "./auth";
import {
  approveTransaction as approveTransactionStore,
  createInventoryItem as createInventoryItemStore,
  createProject as createProjectStore,
  createProjectCost as createProjectCostStore,
  createProjectSale as createProjectSaleStore,
  createTransaction as createTransactionStore,
  deleteInventoryItem as deleteInventoryItemStore,
  deleteProject as deleteProjectStore,
  deleteTransaction as deleteTransactionStore,
  getAccountingSnapshot as getAccountingSnapshotStore,
  getProjectById as getProjectByIdStore,
  getProjectSnapshot as getProjectSnapshotStore,
  recordInventoryIssue as recordInventoryIssueStore,
  recordInventoryReceipt as recordInventoryReceiptStore,
  payInstallment as payInstallmentStore,
  getDueInstallments as getDueInstallmentsStore,
  createInstallmentReminder as createInstallmentReminderStore,
} from "../store/accounting";
import { getUserByTokenAsync } from "../store/auth";
import { parseBody } from "../utils/parse-body";

function respondError(
  res: Parameters<RequestHandler>[1],
  status: number,
  message: string,
) {
  res.status(status).json({ error: message } as ApiError);
}

async function requireAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): Promise<User | null> {
  const token = extractToken(
    req.headers.authorization,
    (req.query.token as string) || undefined,
  );
  if (!token) {
    respondError(res, 401, "Unauthorized");
    return null;
  }
  const user = await getUserByTokenAsync(token);
  if (!user || !user.active) {
    respondError(res, 401, "Unauthorized");
    return null;
  }
  return user;
}

function ensureNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function canApprove(user: User) {
  return user.role === "manager" || user.role === "accountant";
}

export const accountingSnapshotHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const data = await getAccountingSnapshotStore();
  res.json(data as AccountingSnapshot);
};

export const createTransactionHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as TransactionCreateInput;
  if (!body.date || !body.type || !body.description) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const amount = ensureNumber(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    respondError(res, 400, "Invalid amount");
    return;
  }
  const transaction = await createTransactionStore({
    date: String(body.date),
    type: body.type === "revenue" ? "revenue" : "expense",
    description: String(body.description),
    amount,
    approved: canApprove(user) && Boolean(body.approved),
    createdBy: user.id,
  });
  res.status(201).json(transaction as Transaction);
};

export const approveTransactionHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const id = req.params.id;
  try {
    const transaction = await approveTransactionStore(id);
    res.json(transaction as Transaction);
  } catch (error: any) {
    respondError(res, 404, error?.message || "Transaction not found");
  }
};

export const deleteTransactionHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  try {
    await deleteTransactionStore(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    respondError(res, 404, error?.message || "Transaction not found");
  }
};

export const createInventoryItemHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as InventoryItemCreateInput;
  if (!body.name || !body.unit || !body.updatedAt) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const quantity = ensureNumber(body.quantity);
  const min = ensureNumber(body.min);
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isFinite(min) ||
    min < 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  const item = await createInventoryItemStore({
    name: String(body.name),
    quantity,
    unit: String(body.unit),
    min,
    updatedAt: String(body.updatedAt),
  });
  res.status(201).json(item as InventoryItem);
};

export const deleteInventoryItemHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  try {
    await deleteInventoryItemStore(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    respondError(res, 404, error?.message || "Inventory item not found");
  }
};

export const recordInventoryReceiptHandler: RequestHandler = async (
  req,
  res,
) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as InventoryReceiptInput;
  if (
    !body.itemId ||
    !body.qty ||
    !body.unitPrice ||
    !body.date ||
    !body.supplier
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const qty = ensureNumber(body.qty);
  const unitPrice = ensureNumber(body.unitPrice);
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  try {
    const result = await recordInventoryReceiptStore({
      itemId: String(body.itemId),
      qty,
      unitPrice,
      supplier: String(body.supplier),
      date: String(body.date),
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as InventoryMovementResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to record receipt");
  }
};

export const recordInventoryIssueHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as InventoryIssueInput;
  if (
    !body.itemId ||
    !body.qty ||
    !body.unitPrice ||
    !body.date ||
    !body.project
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const qty = ensureNumber(body.qty);
  const unitPrice = ensureNumber(body.unitPrice);
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  try {
    const result = await recordInventoryIssueStore({
      itemId: String(body.itemId),
      qty,
      unitPrice,
      project: String(body.project),
      date: String(body.date),
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as InventoryMovementResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to record issue");
  }
};

export const createProjectHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as ProjectCreateInput;
  if (
    !body.name ||
    !body.location ||
    !body.createdAt ||
    !body.floors ||
    !body.units
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const floors = ensureNumber(body.floors);
  const units = ensureNumber(body.units);
  if (
    !Number.isFinite(floors) ||
    floors <= 0 ||
    !Number.isFinite(units) ||
    units <= 0
  ) {
    respondError(res, 400, "Invalid numeric values");
    return;
  }
  const project = await createProjectStore({
    name: String(body.name),
    location: String(body.location),
    floors,
    units,
    createdAt: String(body.createdAt),
  });
  res.status(201).json(project as Project);
};

export const getProjectHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const project = await getProjectByIdStore(req.params.id);
  if (!project) {
    respondError(res, 404, "Project not found");
    return;
  }
  res.json(project as Project);
};

export const getProjectDetailsHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const snapshot = await getProjectSnapshotStore(req.params.id);
  if (!snapshot) {
    respondError(res, 404, "Project not found");
    return;
  }
  res.json(snapshot);
};

export const deleteProjectHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  try {
    await deleteProjectStore(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    respondError(res, 404, error?.message || "Project not found");
  }
};

export const createProjectCostHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as ProjectCostCreateInput;
  const projectId = req.params.id || body.projectId;
  if (!projectId || !body.projectName || !body.type || !body.date) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const allowedCostTypes = new Set([
    "construction",
    "operation",
    "expense",
    "other",
  ]);
  if (!allowedCostTypes.has(body.type as string)) {
    respondError(res, 400, "Invalid cost type");
    return;
  }
  const amount = ensureNumber(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    respondError(res, 400, "Invalid amount");
    return;
  }
  const customTypeLabelRaw =
    typeof body.customTypeLabel === "string" ? body.customTypeLabel : null;
  if (
    body.type === "other" &&
    (!customTypeLabelRaw || !customTypeLabelRaw.trim())
  ) {
    respondError(res, 400, "Custom type label required");
    return;
  }
  const customTypeLabel = body.type === "other" ? customTypeLabelRaw : null;
  try {
    const result = await createProjectCostStore({
      projectId: String(projectId),
      projectName: String(body.projectName),
      type: body.type,
      customTypeLabel,
      amount,
      date: String(body.date),
      note: body.note ?? "",
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as ProjectCostCreateResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to create cost");
  }
};

export const createProjectSaleHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<Record<string, unknown>>(
    req.body,
  ) as unknown as ProjectSaleCreateInput;
  const projectId = req.params.id || body.projectId;
  if (
    !projectId ||
    !body.projectName ||
    !body.unitNo ||
    !body.buyer ||
    !body.date
  ) {
    respondError(res, 400, "Missing required fields");
    return;
  }
  const price = ensureNumber(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    respondError(res, 400, "Invalid price");
    return;
  }
  const downPayment =
    body.downPayment == null ? null : ensureNumber(body.downPayment);
  const monthlyAmount =
    body.monthlyAmount == null ? null : ensureNumber(body.monthlyAmount);
  const months = body.months == null ? null : ensureNumber(body.months);
  try {
    const result = await createProjectSaleStore({
      projectId: String(projectId),
      projectName: String(body.projectName),
      unitNo: String(body.unitNo),
      buyer: String(body.buyer),
      price,
      date: String(body.date),
      terms: body.terms ?? null,
      area: body.area ?? null,
      paymentMethod: body.paymentMethod ?? null,
      downPayment,
      monthlyAmount,
      months,
      firstDueDate: body.firstDueDate ?? null,
      approved: canApprove(user) && Boolean(body.approved),
      createdBy: user.id,
    });
    res.status(201).json(result as ProjectSaleCreateResult);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to create sale");
  }
};

export const payInstallmentHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const id = req.params.id;
  const body = parseBody<Record<string, unknown>>(req.body) as {
    date?: string;
  };
  const date = body?.date
    ? String(body.date)
    : new Date().toISOString().slice(0, 10);
  try {
    const result = await payInstallmentStore({
      id,
      date,
      approved: canApprove(user),
      createdBy: user.id,
    });
    res.status(200).json(result);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to pay installment");
  }
};

export const dueInstallmentsHandler: RequestHandler = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const date = req.query.date ? String(req.query.date) : undefined;
    const list = await getDueInstallmentsStore(date);
    res.json(list as Installment[]);
  } catch (error: any) {
    respondError(res, 400, error?.message || "Failed to fetch due installments");
  }
};

export const createInstallmentReminderHandler: RequestHandler = async (
  req,
  res,
) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!canApprove(user)) {
    respondError(res, 403, "Forbidden");
    return;
  }
  const body = parseBody<Record<string, unknown>>(req.body) as {
    installmentId?: string;
    note?: string;
  };
  if (!body || !body.installmentId) {
    respondError(res, 400, "Missing installmentId");
    return;
  }
  try {
    await createInstallmentReminderStore(body.installmentId, body.note ?? null);
    res.status(201).json({ ok: true });
  } catch (err: any) {
    respondError(res, 400, err?.message || "Failed to create reminder");
  }
};
