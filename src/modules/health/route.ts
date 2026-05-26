import { Router } from "express";
import { healthController } from "./controller";

const router = Router();

// 16.1 Health Check (Load Balancer, PUBLIC)
router.get("/", healthController.check);

// 16.2 Deep Health Check (Internal IP Allowlist Protected)
router.get("/deep", healthController.deepCheck);

export default router;
