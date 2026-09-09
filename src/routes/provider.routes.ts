import { Router } from "express";
import { listProviders, getCredentialStatus, saveCredential, deleteCredential } from "../controllers/provider.controller";

export const providerRouter = Router();
providerRouter.get("/providers", listProviders);

export const providerCredentialRouter = Router();
providerCredentialRouter.get("/", getCredentialStatus);
providerCredentialRouter.post("/", saveCredential);
providerCredentialRouter.delete("/:provider", deleteCredential);
