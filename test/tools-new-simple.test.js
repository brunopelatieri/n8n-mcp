// test/tools-new-simple.test.js
//
// Cobre as 5 tools novas da Task 3 (SPEC seção 5.2, parcial): delete_execution,
// health_check, manage_tags, manage_variables e audit_instance. Cada uma tem
// um teste de caminho feliz e um de erro/input inválido; manage_variables tem
// também o caso exigido pela task: 404 gracioso quando a instância não expõe
// a API de variáveis.

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

// ─── delete_execution ───────────────────────────────────────────────────────

test("delete_execution: remove uma execução existente", async () => {
    const { body } = await callTool(server.baseUrl, headers, "delete_execution", { id: "e1" });
    assert.equal(body.result.isError, undefined);
    assert.match(body.result.content[0].text, /Execução e1 removida/);
    const req = fakeN8n.requests.filter((r) => r.method === "DELETE" && r.url === "/api/v1/executions/e1").at(-1);
    assert.ok(req, "deve chamar DELETE /api/v1/executions/e1");
});

test("delete_execution: id inexistente -> erro propagado", async () => {
    const { body } = await callTool(server.baseUrl, headers, "delete_execution", { id: "404" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /404/);
});

// ─── health_check ───────────────────────────────────────────────────────────

test("health_check: n8n respondendo -> ok:true com versão via /healthz", async () => {
    const { body } = await callTool(server.baseUrl, headers, "health_check", {});
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[0].text);
    assert.equal(dump.ok, true);
    assert.equal(dump.n8nVersion, "1.50.0");
    assert.equal(typeof dump.latencyMs, "number");
});

test("health_check: /healthz indisponível -> fallback para GET /workflows?limit=1", async () => {
    const fallbackHandler = (record) => {
        const url = new URL(record.url, "http://fake-n8n.local");
        if (url.pathname === "/healthz") return { status: 404, text: "not found" };
        if (url.pathname === "/api/v1/workflows" && record.method === "GET") {
            return { json: { data: [] } };
        }
        return { status: 404, text: "rota não mapeada" };
    };
    const fallbackN8n = await startFakeServer(fallbackHandler);
    try {
        const h = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fallbackN8n.baseUrl });
        const { body } = await callTool(server.baseUrl, h, "health_check", {});
        const dump = JSON.parse(body.result.content[0].text);
        assert.equal(dump.ok, true);
        assert.equal(dump.n8nVersion, undefined);
        const wfReq = fallbackN8n.requests.filter((r) => r.url.startsWith("/api/v1/workflows")).at(-1);
        assert.ok(wfReq, "deve cair para GET /workflows quando /healthz falha");
    } finally {
        await fallbackN8n.close();
    }
});

test("health_check: n8n totalmente indisponível -> ok:false, sem isError", async () => {
    const downHandler = () => ({ status: 500, text: "instância fora do ar" });
    const downN8n = await startFakeServer(downHandler);
    try {
        const h = authHeaders({ mcpKey: "alice-key-123", n8nUrl: downN8n.baseUrl });
        const { body } = await callTool(server.baseUrl, h, "health_check", {});
        assert.equal(body.result.isError, undefined, "health_check nunca deve ser isError");
        const dump = JSON.parse(body.result.content[0].text);
        assert.equal(dump.ok, false);
        assert.ok(dump.error);
    } finally {
        await downN8n.close();
    }
});

// ─── manage_tags ────────────────────────────────────────────────────────────

test("manage_tags: list retorna as tags", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "list" });
    const dump = JSON.parse(body.result.content[0].text);
    assert.deepEqual(dump.data, [{ id: "t1", name: "prod" }]);
});

test("manage_tags: create com name válido", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "create", name: "novo" });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.name, "novo");
});

test("manage_tags: create sem name -> erro claro, não chama a API", async () => {
    const before = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/tags").length;
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "create" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'name' é obrigatório/);
    const after = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/tags").length;
    assert.equal(after, before);
});

test("manage_tags: update de tag existente", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "update", id: "t1", name: "renomeada" });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.name, "renomeada");
});

test("manage_tags: delete remove a tag", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "delete", id: "t1" });
    assert.equal(body.result.isError, undefined);
    assert.match(body.result.content[0].text, /Tag t1 removida/);
});

test("manage_tags: assign atribui tags a um workflow", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "assign", workflowId: "1", tagIds: ["t1"] });
    assert.equal(body.result.isError, undefined);
    const req = fakeN8n.requests.filter((r) => r.method === "PUT" && r.url === "/api/v1/workflows/1/tags").at(-1);
    assert.deepEqual(JSON.parse(req.body), [{ id: "t1" }]);
});

test("manage_tags: assign sem workflowId -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "assign", tagIds: ["t1"] });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'workflowId' é obrigatório/);
});

test("manage_tags: action desconhecida -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_tags", { action: "bogus" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /action desconhecida/);
});

// ─── manage_variables ───────────────────────────────────────────────────────

test("manage_variables: list retorna as variáveis", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "list" });
    const dump = JSON.parse(body.result.content[0].text);
    assert.deepEqual(dump.data, [{ id: "v1", key: "FOO", value: "bar" }]);
});

test("manage_variables: create com key válida", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "create", key: "NEW", value: "1" });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.key, "NEW");
});

test("manage_variables: create sem key -> erro claro, não chama a API", async () => {
    const before = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/variables").length;
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "create", value: "sem-key" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'key' é obrigatório/);
    const after = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/variables").length;
    assert.equal(after, before);
});

test("manage_variables: update de variável existente", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "update", id: "v1", key: "FOO", value: "novo-valor" });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.value, "novo-valor");
});

test("manage_variables: delete remove a variável", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "delete", id: "v1" });
    assert.equal(body.result.isError, undefined);
    assert.match(body.result.content[0].text, /Variável v1 removida/);
});

test("manage_variables: 404 gracioso quando a instância não expõe a API de variáveis", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "delete", id: "missing" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /API de variáveis indisponível ou recurso não encontrado/);
});

test("manage_variables: action desconhecida -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_variables", { action: "bogus" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /action desconhecida/);
});

// ─── audit_instance ─────────────────────────────────────────────────────────

test("audit_instance: gera auditoria sem opções", async () => {
    const { body } = await callTool(server.baseUrl, headers, "audit_instance", {});
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.deepEqual(dump.receivedOptions, {});
    assert.deepEqual(dump.risks, []);
});

test("audit_instance: encaminha categories e daysAbandonedWorkflow", async () => {
    await callTool(server.baseUrl, headers, "audit_instance", { categories: ["credentials"], daysAbandonedWorkflow: 30 });
    const req = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/audit").at(-1);
    const sent = JSON.parse(req.body);
    assert.deepEqual(sent.additionalOptions, { categories: ["credentials"], daysAbandonedWorkflow: 30 });
});

// ─── tools/list inclui as 5 novas tools ─────────────────────────────────────

test("tools/list inclui as 5 tools novas da Task 3", async () => {
    const { body } = await rpc(server.baseUrl, headers, "tools/list");
    const names = body.result.tools.map((t) => t.name);
    for (const n of ["delete_execution", "health_check", "manage_tags", "manage_variables", "audit_instance"]) {
        assert.ok(names.includes(n), `tools/list deve incluir ${n}`);
    }
});
