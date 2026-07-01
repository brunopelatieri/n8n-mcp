// test/tools-update-workflow-partial.test.js
//
// Cobre a tool update_workflow_partial (Task 7 / SPEC seção 5.2): 1 teste de
// caminho feliz por tipo de operação (13 tipos), testes de erro (input inválido
// e referência a node inexistente), atomicidade (uma op inválida no meio do lote
// não deve enviar PUT) e um teste de lote com múltiplas operações.
//
// Estratégia: sobe o servidor MCP + um fake n8n. O fake responde GET
// /workflows/1 com WORKFLOW_DETAIL["1"] e ecoa o corpo em PUT — então cada
// teste inspeciona o corpo do PUT capturado para verificar o resultado do diff.

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

/** Retorna o corpo (parseado) do último PUT /workflows/1 capturado. */
function lastPutBody() {
    const req = fakeN8n.requests.filter((r) => r.method === "PUT" && r.url === "/api/v1/workflows/1").at(-1);
    assert.ok(req, "deveria ter feito PUT /api/v1/workflows/1");
    return JSON.parse(req.body);
}

function countPuts() {
    return fakeN8n.requests.filter((r) => r.method === "PUT" && r.url === "/api/v1/workflows/1").length;
}

async function partial(operations) {
    return callTool(server.baseUrl, headers, "update_workflow_partial", { id: "1", operations });
}

// ─── Happy path: 1 por tipo de operação ───────────────────────────────────────

test("addNode: insere um novo node no workflow", async () => {
    const { body } = await partial([
        { type: "addNode", node: { name: "Code", type: "n8n-nodes-base.code", position: [400, 0] } }
    ]);
    assert.equal(body.result.isError, undefined);
    const put = lastPutBody();
    const code = put.nodes.find((n) => n.name === "Code");
    assert.ok(code, "node Code deve estar no PUT");
    assert.ok(code.id, "addNode deve gerar um id");
    assert.equal(put.nodes.length, 3);
});

test("removeNode: remove node e limpa conexões que o referenciam", async () => {
    const { body } = await partial([{ type: "removeNode", nodeName: "Set" }]);
    assert.equal(body.result.isError, undefined);
    const put = lastPutBody();
    assert.equal(put.nodes.some((n) => n.name === "Set"), false);
    // A conexão Webhook -> Set deve ter perdido o alvo Set.
    const targets = (put.connections.Webhook?.main?.[0] ?? []).map((c) => c.node);
    assert.equal(targets.includes("Set"), false);
});

test("updateNode: aplica updates por dot-path", async () => {
    const { body } = await partial([
        { type: "updateNode", nodeName: "Set", updates: { "parameters.mode": "raw" } }
    ]);
    assert.equal(body.result.isError, undefined);
    const set = lastPutBody().nodes.find((n) => n.name === "Set");
    assert.equal(set.parameters.mode, "raw");
});

test("patchNodeField: aplica find/replace num campo string", async () => {
    const { body } = await partial([
        { type: "patchNodeField", nodeName: "Webhook", fieldPath: "webhookId", patches: [{ find: "abc", replace: "xyz" }] }
    ]);
    assert.equal(body.result.isError, undefined);
    const webhook = lastPutBody().nodes.find((n) => n.name === "Webhook");
    assert.equal(webhook.webhookId, "wh-xyz-123");
});

test("moveNode: altera a posição do node", async () => {
    const { body } = await partial([{ type: "moveNode", nodeName: "Set", position: [500, 100] }]);
    assert.equal(body.result.isError, undefined);
    const set = lastPutBody().nodes.find((n) => n.name === "Set");
    assert.deepEqual(set.position, [500, 100]);
});

test("disableNode: marca o node como disabled", async () => {
    const { body } = await partial([{ type: "disableNode", nodeName: "Set" }]);
    assert.equal(body.result.isError, undefined);
    const set = lastPutBody().nodes.find((n) => n.name === "Set");
    assert.equal(set.disabled, true);
});

test("enableNode: remove a flag disabled", async () => {
    const { body } = await partial([
        { type: "disableNode", nodeName: "Set" },
        { type: "enableNode", nodeName: "Set" }
    ]);
    assert.equal(body.result.isError, undefined);
    const set = lastPutBody().nodes.find((n) => n.name === "Set");
    assert.equal(set.disabled, undefined);
});

test("addConnection: cria conexão entre dois nodes existentes", async () => {
    const { body } = await partial([{ type: "addConnection", source: "Set", target: "Webhook" }]);
    assert.equal(body.result.isError, undefined);
    const conn = lastPutBody().connections.Set?.main?.[0] ?? [];
    assert.ok(conn.some((c) => c.node === "Webhook" && c.type === "main" && c.index === 0));
});

test("removeConnection: remove uma conexão existente", async () => {
    const { body } = await partial([{ type: "removeConnection", source: "Webhook", target: "Set" }]);
    assert.equal(body.result.isError, undefined);
    const targets = (lastPutBody().connections.Webhook?.main?.[0] ?? []).map((c) => c.node);
    assert.equal(targets.includes("Set"), false);
});

test("updateSettings: mescla campos preservando os existentes", async () => {
    const { body } = await partial([{ type: "updateSettings", settings: { executionOrder: "v1" } }]);
    assert.equal(body.result.isError, undefined);
    const put = lastPutBody();
    assert.equal(put.settings.executionOrder, "v1");
    assert.equal(put.settings.saveManualExecutions, true, "settings existentes devem ser preservados");
});

test("updateName: altera o nome do workflow", async () => {
    const { body } = await partial([{ type: "updateName", name: "Renomeado" }]);
    assert.equal(body.result.isError, undefined);
    assert.equal(lastPutBody().name, "Renomeado");
});

test("activateWorkflow: chama o endpoint /activate após o PUT", async () => {
    const { body } = await partial([{ type: "activateWorkflow" }]);
    assert.equal(body.result.isError, undefined);
    const req = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows/1/activate").at(-1);
    assert.ok(req, "deve chamar POST /workflows/1/activate");
});

test("deactivateWorkflow: chama o endpoint /deactivate após o PUT", async () => {
    const { body } = await partial([{ type: "deactivateWorkflow" }]);
    assert.equal(body.result.isError, undefined);
    const req = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows/1/deactivate").at(-1);
    assert.ok(req, "deve chamar POST /workflows/1/deactivate");
});

// ─── Erros ─────────────────────────────────────────────────────────────────────

test("erro: operations vazio -> erro claro, sem PUT", async () => {
    const before = countPuts();
    const { body } = await partial([]);
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /operations.*obrigatório/);
    assert.equal(countPuts(), before, "não deve enviar PUT");
});

test("erro: input inválido (moveNode sem position válida) -> erro específico, sem PUT", async () => {
    const before = countPuts();
    const { body } = await partial([{ type: "moveNode", nodeName: "Set", position: [1] }]);
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /moveNode/);
    assert.match(body.result.content[0].text, /position/);
    assert.equal(countPuts(), before, "não deve enviar PUT quando a operação é inválida");
});

test("erro: node inexistente (addConnection com origem inválida) -> erro específico, sem PUT", async () => {
    const before = countPuts();
    const { body } = await partial([{ type: "addConnection", source: "NaoExiste", target: "Set" }]);
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /addConnection/);
    assert.match(body.result.content[0].text, /NaoExiste/);
    assert.equal(countPuts(), before, "não deve enviar PUT");
});

test("atomicidade: uma op inválida no meio do lote não envia PUT nem aplica as anteriores", async () => {
    const before = countPuts();
    const { body } = await partial([
        { type: "updateName", name: "NaoDeveSerAplicado" },
        { type: "removeNode", nodeName: "Fantasma" } // node inexistente -> falha
    ]);
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /operação #1/);
    assert.match(body.result.content[0].text, /nenhuma alteração foi enviada/);
    assert.equal(countPuts(), before, "lote inválido não deve gerar nenhum PUT");
});

// ─── Lote (batch) ───────────────────────────────────────────────────────────────

test("batch: múltiplas operações válidas numa única chamada", async () => {
    const { body } = await partial([
        { type: "updateName", name: "Fluxo Batch" },
        { type: "addNode", node: { name: "Code2", type: "n8n-nodes-base.code", position: [600, 0] } },
        { type: "addConnection", source: "Set", target: "Code2" },
        { type: "updateSettings", settings: { executionOrder: "v1" } }
    ]);
    assert.equal(body.result.isError, undefined);
    const put = lastPutBody();
    assert.equal(put.name, "Fluxo Batch");
    assert.ok(put.nodes.some((n) => n.name === "Code2"));
    assert.ok((put.connections.Set?.main?.[0] ?? []).some((c) => c.node === "Code2"));
    assert.equal(put.settings.executionOrder, "v1");
    assert.match(body.result.content[0].text, /4 operação/);
});

// ─── tools/list ──────────────────────────────────────────────────────────────

test("tools/list inclui update_workflow_partial", async () => {
    const { body } = await rpc(server.baseUrl, headers, "tools/list");
    const names = body.result.tools.map((t) => t.name);
    assert.ok(names.includes("update_workflow_partial"));
});
