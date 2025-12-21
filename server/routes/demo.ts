import type { RequestHandler } from "express";

export const handleDemo: RequestHandler = (_req, res) => {
  res.status(200).json({ message: "Hello from Express server" });
};
