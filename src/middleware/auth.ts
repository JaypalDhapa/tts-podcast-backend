import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: "Please log in again." });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { email: string };
    req.user = { email: payload.email };
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}
