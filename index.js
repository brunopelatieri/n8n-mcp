import "./secrets-reader.js";
import express from "express";

import { mcpAuth }          from "./src/auth.js";
import { createN8nClient }  from "./src/n8n-client.js";
import { createTemplatesClient } from "./src/templates-client.js";
import { createLlmClient }  from "./src/llm-client.js";
import { getToolDefinitions } from "./src/tools.js";
import { executeTool }      from "./src/tool-handlers.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Host fixo, sem credenciais por requisição — pode ser criado uma única vez.
const templatesClient = createTemplatesClient();

// ─── JSON-RPC ─────────────────────────────────────────────────────────────────
function jsonrpc(id, result) { return { jsonrpc: "2.0", id: id ?? null, result }; }
function jsonrpcError(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/.well-known/oauth-authorization-server", (_req, res) => res.status(404).end());
app.get("/.well-known/openid-configuration",       (_req, res) => res.status(404).end());
app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.get("/mcp", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(ping); } }, 15000);
    req.on("close", () => clearInterval(ping));
});

app.post("/mcp", mcpAuth, async (req, res) => {
    const { method, params, id } = req.body ?? {};

    if (method?.startsWith("notifications/")) return res.status(202).end();

    const wantsSSE = (req.headers["accept"] ?? "").includes("text/event-stream");
    const send = (payload) => {
        if (wantsSSE) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
            res.end();
        } else {
            res.json(payload);
        }
    };

    // Headers por requisição têm sempre precedência. Fallback opt-in (SPEC 7.4):
    // só usa as credenciais padrão do servidor (process.env, via secrets-reader.js)
    // quando ALLOW_DEFAULT_N8N_CREDENTIALS=true — comportamento padrão inalterado.
    const allowDefaultCreds = (process.env.ALLOW_DEFAULT_N8N_CREDENTIALS ?? "").toLowerCase() === "true";
    const n8nUrl    = req.headers["x-n8n-url"]     || (allowDefaultCreds ? process.env.N8N_URL     ?? "" : "");
    const n8nApiKey = req.headers["x-n8n-api-key"] || (allowDefaultCreds ? process.env.N8N_API_KEY  ?? "" : "");

    if (!n8nUrl) {
        return send(jsonrpcError(id, -32000, "Header X-N8N-URL obrigatório. Configure sua URL do n8n."));
    }
    if (!n8nApiKey) {
        return send(jsonrpcError(id, -32000, "Header X-N8N-API-KEY obrigatório. Configure sua API key do n8n."));
    }

    const n8nClient = createN8nClient(n8nUrl, n8nApiKey);

    // generate_workflow_draft é opt-in: X-LLM-API-KEY nunca vem de process.env
    // nem é persistida — só existe no escopo desta requisição.
    const llmApiKey   = req.headers["x-llm-api-key"];
    const llmProvider = req.headers["x-llm-provider"] ?? "openai";
    const llmClient   = createLlmClient(llmApiKey, llmProvider);

    try {
        switch (method) {
            case "initialize":
                return send(jsonrpc(id, {
                    protocolVersion: params?.protocolVersion ?? "2025-03-26",
                    capabilities: { tools: {} },
                    serverInfo: { name: "n8n-mcp", version: "1.0.0" }
                }));
            case "tools/list":
                return send(jsonrpc(id, { tools: getToolDefinitions() }));
            case "tools/call": {
                const toolName = params?.name;
                const toolArgs = params?.arguments ?? {};
                if (!toolName) return send(jsonrpcError(id, -32602, "params.name é obrigatório"));
                const result = await executeTool(toolName, toolArgs, n8nClient, templatesClient, llmClient);
                return send(jsonrpc(id, result));
            }
            case "ping":
                return send(jsonrpc(id, {}));
            default:
                return send(jsonrpcError(id, -32601, `Method not found: ${method}`));
        }
    } catch (e) {
        console.error(`[POST /mcp] ERROR: ${e.message}`);
        return send(jsonrpcError(id, -32000, e.message));
    }
});

app.use((err, req, res, _next) => {
    console.error(`[ERROR]`, err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`╔══════════════════════════════════════════════╗`);
    console.log(`║    n8n MCP Server v5 — JSON-RPC direto       ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    console.log(`║  POST /mcp  → JSON-RPC sem SDK               ║`);
    console.log(`║  GET  /mcp  → SSE keep-alive                 ║`);
    console.log(`║  GET  /health                                 ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    console.log(`║  n8n: credenciais via headers (X-N8N-URL + X-N8N-API-KEY)     ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
});
