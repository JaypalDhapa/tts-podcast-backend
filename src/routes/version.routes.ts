import { Router } from "express";
import { listAllVersions, bulkDeleteVersions } from "../controllers/version.controller";

export const versionRouter = Router();

versionRouter.get("/", listAllVersions);
versionRouter.post("/delete", bulkDeleteVersions);