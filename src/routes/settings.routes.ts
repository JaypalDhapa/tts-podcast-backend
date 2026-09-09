import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/", getSettings);
settingsRouter.patch("/", updateSettings);
