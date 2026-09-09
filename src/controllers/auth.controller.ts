import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "Enter your email and password.");
  }
  const { email, password } = parsed.data;

  const emailMatches = email.toLowerCase() === env.APP_USER_EMAIL.toLowerCase();
  const passwordMatches = await bcrypt.compare(password, env.APP_USER_PASSWORD_HASH);

  if (!emailMatches || !passwordMatches) {
    throw new ApiError(401, "Incorrect email or password.");
  }

  const token = jwt.sign({ email: env.APP_USER_EMAIL }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  res.json({
    user: { id: "single-user", email: env.APP_USER_EMAIL },
    token,
  });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Stateless JWTs — nothing to invalidate server-side for a personal,
  // single-user app. The client just discards the token.
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.json({ id: "single-user", email: req.user!.email });
});
