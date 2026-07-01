// test/tools.test.js
//
// Cobre initialize, tools/list e happy-path + erro de cada uma das 10 tools
// atuais, usando um servidor n8n fake (test/fixtures/fake-n8n.js) — nenhum
// teste depende de rede real ou de uma instância n8n de verdade.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { rpc, callTool, authHeaders } from "./helpers/mcp-client.js";
import { WORKFLOWS_LIST, WORKFLOW_DETAIL, EXECUTIONS_LIST, n8nFakeHandler } from "./fixtures/fake-n8n.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";

let server;
let fakeN8n;
let headers;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
    // N8N_SSRF_MODE=off: o fake n8n roda em 127.0.0.1 (loopback), que o
    // ssrf-guard bloquearia por padrão (modo "moderate") em
    // execute_workflow_via_webhook. O bloqueio em si é coberto por
    // test/webhook-ssrf.test.js, com o modo default.
    server = await startServer({ env: { MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off" } });
    headers = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
});

after(async () => {
    await server.stop();
    await fakeN8n.close();
});

// ─── initialize / tools/list ───────────────────────────────────────────────

test("initialize retorna protocolVersion e serverInfo", async () => {
    const { status, body } = await rpc(server.baseUrl, headers, "initialize", { protocolVersion: "2025-03-26" });
    assert.equal(status, 200);
    assert.equal(body.result.protocolVersion, "2025-03-26");
    assert.equal(body.result.serverInfo.name, "n8n-mcp");
    assert.deepEqual(body.result.capabilities, { tools: {} });
});

test("tools/list retorna as 22 tools esperadas (10 originais + 5 da Task 3 + manage_credentials da Task 4 + 3 templates da Task 5 + generate_workflow_draft da Task 6 + update_workflow_partial da Task 7 + validate_node_config da Task 10)", async () => {
    const { status, body } = await rpc(server.baseUrl, headers, "tools/list");
    assert.equal(status, 200);
    const names = body.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
        "activate_workflow", "create_workflow", "delete_workflow", "execute_workflow_via_webhook",
        "get_executions", "get_workflow", "get_workflow_as_template", "list_workflows",
        "search_workflows", "update_workflow",
        "delete_execution", "health_check", "manage_tags", "manage_variables", "audit_instance",
        "manage_credentials",
        "search_templates", "get_template", "deploy_template",
        "generate_workflow_draft",
        "update_workflow_partial",
        "validate_node_config"
    ].sort());
});

test("ping responde result vazio", async () => {
    const { status, body } = await rpc(server.baseUrl, headers, "ping");
    assert.equal(status, 200);
    assert.deepEqual(body.result, {});
});

test("método desconhecido -> json-rpc error -32601", async () => {
    const { body } = await rpc(server.baseUrl, headers, "foo/bar");
    assert.equal(body.error.code, -32601);
});

test("tools/call sem params.name -> json-rpc error -32602", async () => {
    const { body } = await rpc(server.baseUrl, headers, "tools/call", { arguments: {} });
    assert.equal(body.error.code, -32602);
});

// ─── list_workflows ─────────────────────────────────────────────────────────

test("list_workflows: happy path lista todos os workflows", async () => {
    const { status, body } = await callTool(server.baseUrl, headers, "list_workflows");
    assert.equal(status, 200);
    assert.equal(body.result.isError, undefined);
    assert.match(body.result.content[0].text, new RegExp(`${WORKFLOWS_LIST.length} workflow\\(s\\) encontrado`));
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.data.length, WORKFLOWS_LIST.length);
});

// ─── search_workflows ───────────────────────────────────────────────────────

test("search_workflows: filtra por nome (case-insensitive)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "search_workflows", { name: "one" });
    assert.match(body.result.content[0].text, /2 encontrado\(s\)/);
    const list = JSON.parse(body.result.content[1].text);
    assert.deepEqual(list.map((w) => w.id).sort(), ["1", "3"]);
});

test("search_workflows: sem correspondência retorna lista vazia", async () => {
    const { body } = await callTool(server.baseUrl, headers, "search_workflows", { name: "inexistente-xyz" });
    assert.match(body.result.content[0].text, /0 encontrado\(s\)/);
});

// ─── get_workflow ────────────────────────────────────────────────────────────

test("get_workflow: happy path retorna nome e status ativo", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow", { id: "1" });
    assert.match(body.result.content[0].text, /Workflow: "Workflow One" \(ativo: true\)/);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.id, "1");
});

test("get_workflow: id inexistente -> isError true com mensagem do n8n", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow", { id: "404" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /Erro: n8n error \(404\)/);
});

// ─── create_workflow ─────────────────────────────────────────────────────────

test("create_workflow: happy path envia nodes/connections e devolve id criado", async () => {
    const { body } = await callTool(server.baseUrl, headers, "create_workflow", {
        name: "Novo Workflow",
        nodes: [{ id: "n1", name: "Start", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [0, 0], parameters: {} }],
        connections: {}
    });
    assert.match(body.result.content[0].text, /Workflow criado/);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.id, "999");
    assert.equal(dump.name, "Novo Workflow");
});

test("create_workflow: sem nodes/connections usa defaults (array/objeto vazio)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "create_workflow", { name: "Minimo" });
    assert.equal(body.result.isError, undefined);
    const lastReq = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").at(-1);
    const sent = JSON.parse(lastReq.body);
    assert.deepEqual(sent.nodes, []);
    assert.deepEqual(sent.connections, {});
});

// ─── update_workflow ─────────────────────────────────────────────────────────

test("update_workflow: faz GET+merge+PUT, preservando nodes/connections não informados", async () => {
    const { body } = await callTool(server.baseUrl, headers, "update_workflow", { id: "1", name: "Renomeado" });
    assert.match(body.result.content[0].text, /Workflow atualizado/);

    const putReq = fakeN8n.requests.filter((r) => r.method === "PUT" && r.url === "/api/v1/workflows/1").at(-1);
    const sent = JSON.parse(putReq.body);
    assert.equal(sent.name, "Renomeado");
    assert.deepEqual(sent.nodes, WORKFLOW_DETAIL["1"].nodes);
    assert.deepEqual(sent.connections, WORKFLOW_DETAIL["1"].connections);
});

// ─── activate_workflow ────────────────────────────────────────────────────────

test("activate_workflow: active=true chama endpoint /activate", async () => {
    const { body } = await callTool(server.baseUrl, headers, "activate_workflow", { id: "1", active: true });
    assert.match(body.result.content[0].text, /Workflow 1 ativado/);
    assert.ok(fakeN8n.requests.some((r) => r.method === "POST" && r.url === "/api/v1/workflows/1/activate"));
});

test("activate_workflow: active=false chama endpoint /deactivate", async () => {
    const { body } = await callTool(server.baseUrl, headers, "activate_workflow", { id: "1", active: false });
    assert.match(body.result.content[0].text, /Workflow 1 desativado/);
    assert.ok(fakeN8n.requests.some((r) => r.method === "POST" && r.url === "/api/v1/workflows/1/deactivate"));
});

// ─── delete_workflow ──────────────────────────────────────────────────────────

test("delete_workflow: happy path", async () => {
    const { body } = await callTool(server.baseUrl, headers, "delete_workflow", { id: "1" });
    assert.match(body.result.content[0].text, /Workflow 1 removido/);
});

test("delete_workflow: id inexistente -> isError true", async () => {
    const { body } = await callTool(server.baseUrl, headers, "delete_workflow", { id: "404" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /Erro: n8n error \(404\)/);
});

// ─── get_executions ───────────────────────────────────────────────────────────

test("get_executions: happy path usa limit default 10", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_executions", { workflowId: "1" });
    assert.match(body.result.content[0].text, new RegExp(`${EXECUTIONS_LIST.length} execuç`));
    const lastReq = fakeN8n.requests.filter((r) => r.url.startsWith("/api/v1/executions")).at(-1);
    assert.match(lastReq.url, /limit=10/);
    assert.match(lastReq.url, /workflowId=1/);
});

test("get_executions: respeita limit customizado", async () => {
    await callTool(server.baseUrl, headers, "get_executions", { workflowId: "1", limit: 3 });
    const lastReq = fakeN8n.requests.filter((r) => r.url.startsWith("/api/v1/executions")).at(-1);
    assert.match(lastReq.url, /limit=3/);
});

// ─── execute_workflow_via_webhook ─────────────────────────────────────────────

test("execute_workflow_via_webhook: happy path envia payload e retorna resposta do webhook", async () => {
    const { body } = await callTool(server.baseUrl, headers, "execute_workflow_via_webhook", {
        webhookUrl: `${fakeN8n.baseUrl}/webhook-test/success`,
        payload: { foo: "bar" }
    });
    assert.match(body.result.content[0].text, /Webhook OK \(200\)/);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.received, true);
    assert.deepEqual(dump.echo, { foo: "bar" });
});

test("execute_workflow_via_webhook: erro do webhook -> isError true", async () => {
    const { body } = await callTool(server.baseUrl, headers, "execute_workflow_via_webhook", {
        webhookUrl: `${fakeN8n.baseUrl}/webhook-test/fail`
    });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /Webhook erro \(500\)/);
});

// ─── get_workflow_as_template ─────────────────────────────────────────────────

test("get_workflow_as_template: remove 'id' e 'webhookId' dos nodes (SPEC 5.1)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_workflow_as_template", { id: "1" });
    assert.match(body.result.content[0].text, /Template de "Workflow One"/);
    const tpl = JSON.parse(body.result.content[1].text);
    assert.equal(tpl.name, "Workflow One (cópia)");
    for (const node of tpl.nodes) {
        assert.equal(node.id, undefined);
        assert.equal(node.webhookId, undefined);
    }
});

// ─── tool desconhecida ─────────────────────────────────────────────────────────

test("tool desconhecida -> isError true", async () => {
    const { body } = await callTool(server.baseUrl, headers, "tool_que_nao_existe");
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /Tool desconhecida: tool_que_nao_existe/);
});

// ─── Accept: text/event-stream ─────────────────────────────────────────────────

test("tools/call com Accept text/event-stream responde via SSE", async () => {
    const res = await fetch(`${server.baseUrl}/mcp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headers
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const text = await res.text();
    assert.match(text, /^event: message\ndata: /);
});

// ─── GET /mcp (SSE keep-alive) ──────────────────────────────────────────────────

test("GET /mcp abre stream SSE com content-type correto", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${server.baseUrl}/mcp`, { signal: ctrl.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    ctrl.abort();
});
