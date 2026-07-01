// test/tools-optimizations.test.js
//
// Cobre as otimizações da SPEC seção 5.1 aplicadas às tools existentes
// (Task 2): modos de get_workflow, paginação de list_workflows/search_workflows,
// validação de shape em create_workflow, fallback PUT->PATCH em update_workflow,
// cursor/status/mode em get_executions e httpMethod/headers em
// execute_workflow_via_webhook. O bloqueio de SSRF em si é coberto por
// test/webhook-ssrf.test.js.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { rpc, callTool, authHeaders } from "./helpers/mcp-client.js";
import { WORKFLOW_DETAIL, n8nFakeHandler } from "./fixtures/fake-n8n.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";

let server;
let fakeN8n;
let headers;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
    // fake n8n roda em loopback; desliga o ssrf-guard aqui (o bloqueio default
    // é testado isoladamente em webhook-ssrf.test.js).
    server = await startServer({ env: { MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off" } });
    headers = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
});

after(async () => {
    await server.stop();
    await fakeN8n.close();
});

// ─── get_workflow: modes ────────────────────────────────────────────────────

test("get_workflow: sem mode -> comportamento default (full, igual ao original)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow", { id: "1" });
    const dump = JSON.parse(body.result.content[1].text);
    assert.deepEqual(dump, WORKFLOW_DETAIL["1"]);
});

test("get_workflow: mode=minimal retorna resumo enxuto", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow", { id: "1", mode: "minimal" });
    const dump = JSON.parse(body.result.content[1].text);
    assert.deepEqual(dump, { id: "1", name: "Workflow One", active: true, nodeCount: 2, tags: [] });
});

test("get_workflow: mode=structure remove parameters/credentials dos nodes", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow", { id: "1", mode: "structure" });
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.nodes.length, 2);
    for (const n of dump.nodes) assert.equal(n.parameters, undefined);
    assert.deepEqual(dump.connections, WORKFLOW_DETAIL["1"].connections);
});

test("get_workflow: mode=filtered só inclui os nodeNames pedidos", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow", { id: "1", mode: "filtered", nodeNames: ["Set"] });
    const dump = JSON.parse(body.result.content[1].text);
    assert.deepEqual(dump.nodes.map((n) => n.name), ["Set"]);
});

// ─── list_workflows: paginação/filtros ──────────────────────────────────────

test("list_workflows: encaminha limit/active/tags como query params reais", async () => {
    await callTool(server.baseUrl, headers, "list_workflows", { limit: 5, active: true, tags: ["prod", "critico"] });
    const lastReq = fakeN8n.requests.filter((r) => r.method === "GET" && r.url.startsWith("/api/v1/workflows")).at(-1);
    const url = new URL(lastReq.url, "http://fake-n8n.local");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("active"), "true");
    assert.equal(url.searchParams.get("tags"), "prod,critico");
});

test("list_workflows: sem parâmetros não envia query string (comportamento default preservado)", async () => {
    await callTool(server.baseUrl, headers, "list_workflows");
    const lastReq = fakeN8n.requests.filter((r) => r.method === "GET" && r.url.startsWith("/api/v1/workflows")).at(-1);
    assert.equal(lastReq.url, "/api/v1/workflows");
});

test("list_workflows: devolve nextCursor quando a API do n8n o retorna", async () => {
    const { body } = await callTool(server.baseUrl, headers, "list_workflows");
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.nextCursor, "cursor-2");
});

// ─── search_workflows: reusa a listagem paginada ────────────────────────────

test("search_workflows: percorre todas as páginas (nextCursor) antes de filtrar", async () => {
    const { body } = await callTool(server.baseUrl, headers, "search_workflows", { name: "Two" });
    const list = JSON.parse(body.result.content[1].text);
    // "Test Two" está na página 1, "Page Two Workflow" só existe na página 2
    assert.deepEqual(list.map((w) => w.id).sort(), ["2", "4"]);
});

// ─── create_workflow: validação de shape dos nodes ──────────────────────────

test("create_workflow: node sem campos obrigatórios -> erro claro, não chama a API", async () => {
    const before = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").length;
    const { body } = await callTool(server.baseUrl, headers, "create_workflow", {
        name: "Inválido",
        nodes: [{ name: "SemTipo" }]
    });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /campo\(s\) obrigatório\(s\) ausente/);
    const after = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").length;
    assert.equal(after, before, "não deve chamar a API do n8n quando a validação falha");
});

test("create_workflow: node válido continua funcionando normalmente", async () => {
    const { body } = await callTool(server.baseUrl, headers, "create_workflow", {
        name: "Válido",
        nodes: [{ id: "n1", name: "Start", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [0, 0], parameters: {} }]
    });
    assert.equal(body.result.isError, undefined);
});

// ─── update_workflow: fallback PUT->PATCH em 405 ────────────────────────────

test("update_workflow: PUT 405 -> fallback automático para PATCH", async () => {
    const { body } = await callTool(server.baseUrl, headers, "update_workflow", { id: "legacy", name: "Legado Renomeado" });
    assert.equal(body.result.isError, undefined);
    assert.match(body.result.content[0].text, /Workflow atualizado/);

    const putReq   = fakeN8n.requests.filter((r) => r.method === "PUT"   && r.url === "/api/v1/workflows/legacy").at(-1);
    const patchReq = fakeN8n.requests.filter((r) => r.method === "PATCH" && r.url === "/api/v1/workflows/legacy").at(-1);
    assert.ok(putReq, "deve tentar PUT primeiro");
    assert.ok(patchReq, "deve cair para PATCH após 405");
    assert.equal(JSON.parse(patchReq.body).name, "Legado Renomeado");
});

test("update_workflow: workflow normal (id=1) continua usando só PUT", async () => {
    await callTool(server.baseUrl, headers, "update_workflow", { id: "1", name: "Sem fallback" });
    const patchReq = fakeN8n.requests.filter((r) => r.method === "PATCH" && r.url === "/api/v1/workflows/1").at(-1);
    assert.equal(patchReq, undefined);
});

// ─── get_executions: cursor/status/mode ─────────────────────────────────────

test("get_executions: encaminha cursor e status como query params", async () => {
    await callTool(server.baseUrl, headers, "get_executions", { workflowId: "1", cursor: "abc", status: "error" });
    const lastReq = fakeN8n.requests.filter((r) => r.url.startsWith("/api/v1/executions")).at(-1);
    const url = new URL(lastReq.url, "http://fake-n8n.local");
    assert.equal(url.searchParams.get("cursor"), "abc");
    assert.equal(url.searchParams.get("status"), "error");
});

test("get_executions: mode=preview retorna só id/status/startedAt", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_executions", { workflowId: "1", mode: "preview" });
    const dump = JSON.parse(body.result.content[1].text);
    for (const e of dump.data) {
        assert.deepEqual(Object.keys(e).sort(), ["id", "startedAt", "status"]);
    }
});

test("get_executions: sem mode -> comportamento default (full, dump completo)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_executions", { workflowId: "1" });
    const dump = JSON.parse(body.result.content[1].text);
    assert.ok(Array.isArray(dump.data));
    assert.ok("id" in dump.data[0] && "status" in dump.data[0]);
});

// ─── execute_workflow_via_webhook: httpMethod/headers ───────────────────────

test("execute_workflow_via_webhook: httpMethod=GET não envia body", async () => {
    const { body } = await callTool(server.baseUrl, headers, "execute_workflow_via_webhook", {
        webhookUrl: `${fakeN8n.baseUrl}/webhook-test/success`,
        httpMethod: "GET"
    });
    assert.equal(body.result.isError, undefined);
    const lastReq = fakeN8n.requests.filter((r) => r.url === "/webhook-test/success").at(-1);
    assert.equal(lastReq.method, "GET");
    assert.equal(lastReq.body, "");
});

test("execute_workflow_via_webhook: headers customizados chegam ao destino", async () => {
    await callTool(server.baseUrl, headers, "execute_workflow_via_webhook", {
        webhookUrl: `${fakeN8n.baseUrl}/webhook-test/success`,
        headers: { "X-Custom-Header": "valor-custom" }
    });
    const lastReq = fakeN8n.requests.filter((r) => r.url === "/webhook-test/success").at(-1);
    assert.equal(lastReq.headers["x-custom-header"], "valor-custom");
});

test("execute_workflow_via_webhook: sem httpMethod -> default POST (comportamento original)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "execute_workflow_via_webhook", {
        webhookUrl: `${fakeN8n.baseUrl}/webhook-test/success`,
        payload: { foo: "bar" }
    });
    const dump = JSON.parse(body.result.content[1].text);
    assert.deepEqual(dump.echo, { foo: "bar" });
    const lastReq = fakeN8n.requests.filter((r) => r.url === "/webhook-test/success").at(-1);
    assert.equal(lastReq.method, "POST");
});
