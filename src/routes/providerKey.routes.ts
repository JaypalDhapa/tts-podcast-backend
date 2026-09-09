import { Router } from "express";
import { listKeys, createKey, updateKey, deleteKey } from "../controllers/providerKey.controller";

export const providerKeyRouter = Router();

providerKeyRouter.get("/", listKeys);
providerKeyRouter.post("/", createKey);
providerKeyRouter.patch("/:id", updateKey);
providerKeyRouter.delete("/:id", deleteKey);