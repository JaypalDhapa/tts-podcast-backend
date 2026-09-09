import { Router } from "express";
import { previewBlock } from "../controllers/block.controller";

export const blockRouter = Router();

blockRouter.post("/:id/preview", previewBlock);
