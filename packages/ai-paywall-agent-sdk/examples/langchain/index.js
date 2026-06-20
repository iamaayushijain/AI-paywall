/**
 * LangChain tool example.
 *
 * Gives an LLM agent the ability to fetch any URL — including 402-gated
 * ones — within operator-defined safety caps.
 */

import "dotenv/config";
import {
  createAgentPaywallClient,
  fromKeypairFile,
} from "tollgate-agent-sdk";
import { paywallFetchTool } from "tollgate-agent-sdk/langchain";

const client = createAgentPaywallClient({
  network: process.env.SOLANA_NETWORK || "devnet",
  signer: fromKeypairFile(),
  maxAmountMicroUsdc: 5_000,
  maxTotalMicroUsdc: 500_000,
  userAgent: "GPTBot",
});

const tool = paywallFetchTool(client, {
  allowHost: (host) => {
    return host === "localhost:4010" || host.endsWith(".example.com");
  },
});

const result = await tool.invoke({
  url: process.env.TEST_URL || "http://localhost:4010/articles/test",
});

console.log(result);
