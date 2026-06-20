import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardHtmlPath = path.join(__dirname, "../../client/dashboard.html");

/**
 * Static dashboard HTML.
 *
 * Wallet-scoped data is fetched from /v1/dashboard (authenticated via
 * Sign-In With Solana). The legacy unauthenticated /dashboard/data
 * endpoint has been removed in favor of that wallet-scoped flow.
 */
router.get("/", (_req, res) => {
  res.sendFile(dashboardHtmlPath);
});

export default router;
