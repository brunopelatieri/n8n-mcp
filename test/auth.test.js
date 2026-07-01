// test/auth.test.js
//
// Cobre a camada de autenticação MCP em POST /mcp:
//   - parsing de MCP_ALLOWED_KEYS ("nome:chave,nome:chave,...")
//   - aceitação/rejeição de X-MCP-KEY
//   - servidor mal configurado (MCP_ALLOWED_KEYS ausente) -> 500
//   - bypass de auth para métodos notifications/*
//
// Nota sobre comportamento atual (baseline, não é bug a corrigir aqui):
// mesmo tools/list e initialize exigem X-N8N-URL/X-N8N-API-KEY, porque a
// checagem desses headers roda antes do dispatch do método. Isso é
// documentado fielmente pelos testes abaixo.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { rpc } from "./helpers/mcp-client.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123,bob:bob-key-456";

let server;

before(async () => {
    server = await startServer({ env: { MCP_ALLOWED_KEYS } });
});

after(async () => {
    await server.stop();
});

test("sem MCP_ALLOWED_KEYS no servidor -> 500 (servidor mal configurado)", async () => {
    const unconfigured = await startServer({}); // sem MCP_ALLOWED_KEYS
    try {
        const { status, body } = await rpc(unconfigured.baseUrl, { "X-MCP-KEY": "qualquer" }, "tools/list");
        assert.equal(status, 500);
        assert.match(body.error.message, /MCP_ALLOWED_KEYS/);
    } finally {
        await unconfigured.stop();
    }
});

test("sem header X-MCP-KEY -> 401", async () => {
    const { status, body } = await rpc(server.baseUrl, {}, "tools/list");
    assert.equal(status, 401);
    assert.match(body.error.message, /Unauthorized/);
});

test("com X-MCP-KEY inválida -> 401", async () => {
    const { status, body } = await rpc(server.baseUrl, { "X-MCP-KEY": "chave-errada" }, "tools/list");
    assert.equal(status, 401);
    assert.match(body.error.message, /Unauthorized/);
});

test("com X-MCP-KEY válida (primeiro usuário da lista) mas sem X-N8N-URL -> erro json-rpc pedindo o header", async () => {
    const { status, body } = await rpc(server.baseUrl, { "X-MCP-KEY": "alice-key-123" }, "tools/list");
    assert.equal(status, 200); // auth passou; erro é de negócio (jsonrpcError), não HTTP
    assert.match(body.error.message, /X-N8N-URL/);
});

test("com X-MCP-KEY válida (segundo usuário da lista) mas sem X-N8N-URL -> mesmo comportamento", async () => {
    const { status, body } = await rpc(server.baseUrl, { "X-MCP-KEY": "bob-key-456" }, "tools/list");
    assert.equal(status, 200);
    assert.match(body.error.message, /X-N8N-URL/);
});

test("com X-MCP-KEY e X-N8N-URL válidos mas sem X-N8N-API-KEY -> erro json-rpc pedindo a api key", async () => {
    const { status, body } = await rpc(
        server.baseUrl,
        { "X-MCP-KEY": "alice-key-123", "X-N8N-URL": "http://localhost:9" },
        "tools/list"
    );
    assert.equal(status, 200);
    assert.match(body.error.message, /X-N8N-API-KEY/);
});

test("método notifications/* dispensa autenticação e responde 202 mesmo sem X-MCP-KEY", async () => {
    const res = await fetch(`${server.baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    });
    assert.equal(res.status, 202);
});
