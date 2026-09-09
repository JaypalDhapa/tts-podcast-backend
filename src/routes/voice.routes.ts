import { Router } from "express";
import { listVoices, createVoice, updateVoice, deleteVoice } from "../controllers/voice.controller";

export const voiceRouter = Router();

voiceRouter.get("/", listVoices);
voiceRouter.post("/", createVoice);
voiceRouter.patch("/:id", updateVoice);
voiceRouter.delete("/:id", deleteVoice);
