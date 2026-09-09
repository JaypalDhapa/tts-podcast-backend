import { Router } from "express";
import {
  listPodcasts,
  getPodcast,
  createPodcast,
  updatePodcast,
  deletePodcast,
  listVersions,
  getVersion,
  editAsNewVersion,
} from "../controllers/podcast.controller";
import { generatePodcast } from "../controllers/generation.controller";

export const podcastRouter = Router();

podcastRouter.get("/", listPodcasts);
podcastRouter.post("/", createPodcast);
podcastRouter.get("/:id", getPodcast);
podcastRouter.patch("/:id", updatePodcast);
podcastRouter.delete("/:id", deletePodcast);

podcastRouter.get("/:id/versions", listVersions);
podcastRouter.get("/:id/versions/:versionId", getVersion);
podcastRouter.post("/:id/versions", editAsNewVersion);

podcastRouter.post("/:id/generate", generatePodcast);
