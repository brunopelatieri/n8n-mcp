// test/tools-templates.test.js
//
// Cobre as tools de templates do n8n.io (Task 5, SPEC seção 5.2.1):
// search_templates, get_template e deploy_template. O fetch para
// https://api.n8n.io é sempre redirecionado para um servidor fake local via
// N8N_TEMPLATES_API_BASE — a API real do n8n.io NUNCA é chamada nos testes.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { callTool, authHeaders } from "./helpers/mcp-client.js";
import { n8nFakeHandler } from "./fixtures/fake-n8n.js";
import { templatesFakeHandler } from "./fixtures/fake-templates.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";

let server;
let fakeN8n;
let fakeTemplates;
let headers;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
    fakeTemplates = await startFakeServer(templatesFakeHandler);
    server = await startServer({
        env: {
            MCP_ALLOWED_KEYS,
            N8N_SSRF_MODE: "off",
            N8N_TEMPLATES_API_BASE: `${fakeTemplates.baseUrl}/api/templates`
        }
    });
    headers = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
});

after(async () => {
    await server.stop();
    await fakeN8n.close();
    await fakeTemplates.close();
});

// ─── search_templates ───────────────────────────────────────────────────────

test("search_templates: happy path devolve lista resumida", async () => {
    const { body } = await callTool(server.baseUrl, headers, "search_templates", { search: "slack" });
    const list = JSON.parse(body.result.content[1].text);
    assert.deepEqual(list, [
        { id: 1001, name: "Slack Notifier", description: "Envia mensagens ao Slack", totalViews: 500, nodes: ["n8n-nodes-base.webhook", "n8n-nodes-base.slack"] },
        { id: 1002, name: "Two", description: "Segundo template", totalViews: 10, nodes: [] }
    ]);
});

test("search_templates: encaminha search/limit/cursor como search/rows/page", async () => {
    await callTool(server.baseUrl, headers, "search_templates", { search: "slack", limit: 5, cursor: "2" });
    const lastReq = fakeTemplates.requests.at(-1);
    const url = new URL(lastReq.url, "http://fake-templates.local");
    assert.equal(url.pathname, "/api/templates/search");
    assert.equal(url.searchParams.get("search"), "slack");
    assert.equal(url.searchParams.get("rows"), "5");
    assert.equal(url.searchParams.get("page"), "2");
});

test("search_templates: sem parâmetros não envia query string", async () => {
    await callTool(server.baseUrl, headers, "search_templates", {});
    const lastReq = fakeTemplates.requests.at(-1);
    assert.equal(lastReq.url, "/api/templates/search");
});

// ─── get_template ───────────────────────────────────────────────────────────

test("get_template: happy path devolve id/name/description/workflow normalizados", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_template", { templateId: "1001" });
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.id, 1001);
    assert.equal(dump.name, "Slack Notifier");
    assert.equal(dump.workflow.nodes.length, 2);
    assert.deepEqual(dump.workflow.settings, { saveManualExecutions: true });
});

test("get_template: templateId inexistente -> isError true", async () => {
    const { body } = await callTool(server.baseUrl, headers, "get_template", { templateId: "404" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /404/);
});

test("get_template: sem templateId -> erro claro, não chama a API", async () => {
    const before = fakeTemplates.requests.length;
    const { body } = await callTool(server.baseUrl, headers, "get_template", {});
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'templateId' é obrigatório/);
    assert.equal(fakeTemplates.requests.length, before);
});

// ─── deploy_template ─────────────────────────────────────────────────────────

test("deploy_template: happy path remove id/webhookId/credentials e cria o workflow", async () => {
    const { body } = await callTool(server.baseUrl, headers, "deploy_template", { templateId: "1001" });
    assert.equal(body.result.isError, undefined);

    const createReq = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").at(-1);
    assert.ok(createReq, "deve chamar create_workflow internamente");
    const sentBody = JSON.parse(createReq.body);

    assert.equal(sentBody.name, "Slack Notifier");
    assert.equal(sentBody.nodes.length, 2);
    for (const n of sentBody.nodes) {
        assert.notEqual(n.id, "tpl-node-a");
        assert.notEqual(n.id, "tpl-node-b");
        assert.ok(n.id, "node deve receber um novo id gerado");
        assert.equal(n.webhookId, undefined);
        assert.equal(n.credentials, undefined, "stripCredentials=true (padrão) deve remover credentials");
    }
});

test("deploy_template: stripCredentials=false preserva credentials dos nodes", async () => {
    await callTool(server.baseUrl, headers, "deploy_template", { templateId: "1001", stripCredentials: false });
    const createReq = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").at(-1);
    const sentBody = JSON.parse(createReq.body);
    const slackNode = sentBody.nodes.find((n) => n.name === "Slack");
    assert.deepEqual(slackNode.credentials, { slackApi: { id: "cred1", name: "My Slack" } });
});

test("deploy_template: name customizado sobrescreve o nome do template", async () => {
    const { body } = await callTool(server.baseUrl, headers, "deploy_template", { templateId: "1001", name: "Meu Slack" });
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.name, "Meu Slack");
    const createReq = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").at(-1);
    assert.equal(JSON.parse(createReq.body).name, "Meu Slack");
});

test("deploy_template: templateId inexistente -> isError true, não chama create_workflow", async () => {
    const before = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").length;
    const { body } = await callTool(server.baseUrl, headers, "deploy_template", { templateId: "404" });
    assert.equal(body.result.isError, true);
    const after = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/workflows").length;
    assert.equal(after, before);
});

test("deploy_template: sem templateId -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headers, "deploy_template", {});
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'templateId' é obrigatório/);
});
