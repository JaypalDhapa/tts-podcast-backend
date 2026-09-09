import { Router } from "express";
import { getGenerationStatus } from "../controllers/generation.controller";

export const generationRouter = Router();

generationRouter.get("/:id", getGenerationStatus);
