// test/tools-validate-node-config.test.js
//
// Cobre a tool validate_node_config (Task 10) e a integração best-effort
// (nodeValidationWarnings) em create_workflow/update_workflow/update_workflow_partial.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { rpc, callTool, authHeaders } from "./helpers/mcp-client.js";
import { n8nFakeHandler } from "./fixtures/fake-n8n.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";

let server;
let fakeN8n;
let headers;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
    server = await startServer({ env: { MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off" } });
    headers = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
});

after(async () => {
    await server.stop();
    await fakeN8n.close();
});

// ─── validate_node_config (tool direta) ─────────────────────────────────────

test("validate_node_config: node conhecido, campo obrigatório ausente -> warning", async () => {
    const { body } = await callTool(server.baseUrl, headers, "validate_node_config", {
        nodeType: "n8n-nodes-base.httpRequest",
        parameters: {}
    });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[0].text);
    assert.equal(dump.known, true);
    assert.equal(dump.errors.length, 0);
    assert.equal(dump.warnings.length, 1);
});

test("validate_node_config: node fora da lista curada -> known:false", async () => {
    const { body } = await callTool(server.baseUrl, headers, "validate_node_config", {
        nodeType: "n8n-nodes-base.notionUnknown"
    });
    const dump = JSON.parse(body.result.content[0].text);
    assert.equal(dump.known, false);
});

test("validate_node_config: resource/operation inválidos -> error", async () => {
    const { body } = await callTool(server.baseUrl, headers, "validate_node_config", {
        nodeType: "n8n-nodes-base.postgres",
        parameters: { operation: "bogus" }
    });
    const dump = JSON.parse(body.result.content[0].text);
    assert.equal(dump.errors.length, 1);
});

test("validate_node_config: sem nodeType -> erro claro, não chama a API do n8n", async () => {
    const before = fakeN8n.requests.length;
    const { body } = await callTool(server.baseUrl, headers, "validate_node_config", {});
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'nodeType' é obrigatório/);
    assert.equal(fakeN8n.requests.length, before);
});

// ─── integração best-effort: create_workflow ────────────────────────────────

test("create_workflow: node com campo obrigatório ausente -> nodeValidationWarnings anexado, não bloqueia", async () => {
    const { body } = await callTool(server.baseUrl, headers, "create_workflow", {
        name: "Com HTTP incompleto",
        nodes: [
            { id: "n1", name: "Chamada", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [0, 0], parameters: {} }
        ]
    });
    assert.equal(body.result.isError, undefined, "nodeValidationWarnings nunca deve bloquear a criação");
    const dump = JSON.parse(body.result.content[1].text);
    assert.ok(dump.id, "workflow deve ser criado normalmente");
    assert.equal(dump.nodeValidationWarnings.length, 1);
    assert.equal(dump.nodeValidationWarnings[0].node, "Chamada");
    assert.equal(dump.nodeValidationWarnings[0].warnings.length, 1);
});

test("create_workflow: node válido -> sem campo nodeValidationWarnings", async () => {
    const { body } = await callTool(server.baseUrl, headers, "create_workflow", {
        name: "Tudo certo",
        nodes: [
            { id: "n1", name: "Chamada", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [0, 0], parameters: { url: "https://example.com" } }
        ]
    });
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.nodeValidationWarnings, undefined);
});

// ─── integração best-effort: update_workflow ────────────────────────────────

test("update_workflow: nodes substituídos com campo ausente -> nodeValidationWarnings anexado", async () => {
    const { body } = await callTool(server.baseUrl, headers, "update_workflow", {
        id: "1",
        nodes: [
            { id: "n1", name: "Postgres", type: "n8n-nodes-base.postgres", typeVersion: 1, position: [0, 0], parameters: { operation: "insert" } }
        ]
    });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.nodeValidationWarnings.length, 1);
    assert.match(dump.nodeValidationWarnings[0].warnings[0], /"table"/);
});

// ─── integração best-effort: update_workflow_partial ────────────────────────

test("update_workflow_partial: addNode com campo obrigatório ausente -> nodeValidationWarnings anexado", async () => {
    const { body } = await callTool(server.baseUrl, headers, "update_workflow_partial", {
        id: "1",
        operations: [
            {
                type: "addNode",
                node: { id: "n-new", name: "Nova Chamada", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [400, 0], parameters: {} }
            }
        ]
    });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.ok(dump.nodeValidationWarnings.some((w) => w.node === "Nova Chamada"));
});

// ─── tools/list inclui validate_node_config ─────────────────────────────────

test("tools/list inclui validate_node_config", async () => {
    const { body } = await rpc(server.baseUrl, headers, "tools/list");
    const names = body.result.tools.map((t) => t.name);
    assert.ok(names.includes("validate_node_config"));
});
