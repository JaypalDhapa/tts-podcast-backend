import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (err.internalDetail) {
      console.error(`[${req.method} ${req.path}] ${err.message} — ${err.internalDetail}`);
    }
    res.status(err.status).json({ message: err.message, code: err.code });
    return;
  }

  console.error(`[${req.method} ${req.path}] Unhandled error:`, err);
  res.status(500).json({ message: "Something went wrong. Please try again." });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: "Not found." });
}
