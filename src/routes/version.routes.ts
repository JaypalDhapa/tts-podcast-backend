import { Router } from "express";
import { listAllVersions, bulkDeleteVersions, downloadVersionTranscript } from "../controllers/version.controller";

export const versionRouter = Router();

versionRouter.get("/", listAllVersions);
versionRouter.post("/delete", bulkDeleteVersions);
versionRouter.get("/:id/transcript", downloadVersionTranscript);