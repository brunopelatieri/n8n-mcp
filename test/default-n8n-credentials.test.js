// test/default-n8n-credentials.test.js
//
// Cobre o fallback de credenciais padrão do servidor (SPEC seção 7, item 4):
// se X-N8N-URL/X-N8N-API-KEY estiverem ausentes E
// ALLOW_DEFAULT_N8N_CREDENTIALS=true, usa N8N_URL/N8N_API_KEY de process.env
// (carregados por secrets-reader.js) como tenant padrão. Opt-in: comportamento
// atual (headers obrigatórios) é preservado quando a flag está off/ausente, e
// headers por requisição sempre têm precedência sobre os defaults do servidor.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { rpc, callTool, authHeaders } from "./helpers/mcp-client.js";
import { n8nFakeHandler } from "./fixtures/fake-n8n.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";

let fakeN8n;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
});

after(async () => {
    await fakeN8n.close();
});

test("flag ausente: sem headers X-N8N-URL/X-N8N-API-KEY -> erro, mesmo com N8N_URL/N8N_API_KEY no ambiente", async () => {
    const server = await startServer({
        env: { MCP_ALLOWED_KEYS, N8N_URL: fakeN8n.baseUrl, N8N_API_KEY: "server-default-key", N8N_SSRF_MODE: "off" }
    });
    try {
        const { body } = await rpc(server.baseUrl, authHeaders({ mcpKey: "alice-key-123" }), "tools/call", {
            name: "list_workflows", arguments: {}
        });
        assert.equal(body.error?.message, "Header X-N8N-URL obrigatório. Configure sua URL do n8n.");
    } finally {
        await server.stop();
    }
});

test("flag=true, sem headers: usa N8N_URL/N8N_API_KEY do ambiente como tenant padrão", async () => {
    const server = await startServer({
        env: {
            MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off",
            ALLOW_DEFAULT_N8N_CREDENTIALS: "true",
            N8N_URL: fakeN8n.baseUrl, N8N_API_KEY: "server-default-key"
        }
    });
    try {
        const before = fakeN8n.requests.length;
        // authHeaders() sempre define X-N8N-API-KEY (default "test-api-key"); para
        // testar o fallback é preciso montar os headers manualmente, sem X-N8N-*.
        const noN8nHeaders = { "X-MCP-KEY": "alice-key-123" };
        const { body } = await callTool(server.baseUrl, noN8nHeaders, "list_workflows", {});
        assert.equal(body.result.isError, undefined);
        const req = fakeN8n.requests.slice(before).find((r) => r.url.startsWith("/api/v1/workflows"));
        assert.ok(req, "deveria ter chamado o fake n8n configurado via env");
        assert.equal(req.headers["x-n8n-api-key"], "server-default-key");
    } finally {
        await server.stop();
    }
});

test("flag=true, com headers: headers por requisição têm precedência sobre os defaults do servidor", async () => {
    const perRequestN8n = await startFakeServer(n8nFakeHandler);
    const server = await startServer({
        env: {
            MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off",
            ALLOW_DEFAULT_N8N_CREDENTIALS: "true",
            N8N_URL: fakeN8n.baseUrl, N8N_API_KEY: "server-default-key"
        }
    });
    try {
        const before = { default: fakeN8n.requests.length, perRequest: perRequestN8n.requests.length };
        const headers = authHeaders({ mcpKey: "alice-key-123", n8nUrl: perRequestN8n.baseUrl, n8nApiKey: "per-request-key" });
        const { body } = await callTool(server.baseUrl, headers, "list_workflows", {});
        assert.equal(body.result.isError, undefined);

        const reqOnDefault    = fakeN8n.requests.slice(before.default).some((r) => r.url.startsWith("/api/v1/workflows"));
        const reqOnPerRequest = perRequestN8n.requests.slice(before.perRequest).find((r) => r.url.startsWith("/api/v1/workflows"));
        assert.equal(reqOnDefault, false, "não deve chamar o n8n padrão do servidor quando headers foram enviados");
        assert.ok(reqOnPerRequest, "deve chamar o n8n do header X-N8N-URL");
        assert.equal(reqOnPerRequest.headers["x-n8n-api-key"], "per-request-key");
    } finally {
        await server.stop();
        await perRequestN8n.close();
    }
});

test("flag=false explícito: comportamento igual a flag ausente (headers continuam obrigatórios)", async () => {
    const server = await startServer({
        env: {
            MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off",
            ALLOW_DEFAULT_N8N_CREDENTIALS: "false",
            N8N_URL: fakeN8n.baseUrl, N8N_API_KEY: "server-default-key"
        }
    });
    try {
        const { body } = await rpc(server.baseUrl, authHeaders({ mcpKey: "alice-key-123" }), "tools/call", {
            name: "list_workflows", arguments: {}
        });
        assert.equal(body.error?.message, "Header X-N8N-URL obrigatório. Configure sua URL do n8n.");
    } finally {
        await server.stop();
    }
});
