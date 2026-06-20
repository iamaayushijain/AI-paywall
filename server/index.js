import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { aiDetector } from "./middleware/aiDetector.js";
import contentRoute from "./routes/content.js";
import policyRoute from "./routes/policy.js";
import dashboardRoute from "./routes/dashboard.js";
import v1Route from "./routes/v1.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(aiDetector);

app.use(express.static(path.join(__dirname, "../client")));

// Specific routes — must come before the catch-all
app.use("/.well-known/ai-policy.json", policyRoute);
app.use("/dashboard", dashboardRoute);
app.use("/v1", v1Route);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Catch-all content route (must be last)
app.use(contentRoute);

// JSON error handler (prevents HTML 500 pages breaking API clients/tests)
app.use((err, req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res
    .status(err.statusCode || 500)
    .json({ status: "error", error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`\n  🛡️  AI Paywall Server running on http://localhost:${PORT}`);
  console.log(`  📄 Content:    http://localhost:${PORT}/page`);
  console.log(`  📊 Dashboard:  http://localhost:${PORT}/dashboard`);
  console.log(`  📜 Policy:     http://localhost:${PORT}/.well-known/ai-policy.json`);
  console.log(`  💰 Wallet:     ${process.env.WALLET_ADDRESS}`);
  console.log(`  🌐 Network:    Solana Devnet\n`);
});
