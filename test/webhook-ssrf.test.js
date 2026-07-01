// test/webhook-ssrf.test.js
//
// Cobre a integração do ssrf-guard em execute_workflow_via_webhook (SPEC 5.1):
// no modo default ("moderate"), uma URL de webhook apontando para loopback
// deve ser bloqueada ANTES do fetch. Roda o servidor sem sobrescrever
// N8N_SSRF_MODE (ao contrário de tools.test.js / tools-optimizations.test.js,
// que desligam o guard porque usam um fake n8n em loopback de propósito).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { callTool, authHeaders } from "./helpers/mcp-client.js";
import { n8nFakeHandler } from "./fixtures/fake-n8n.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";

let server;
let fakeN8n;
let headers;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
    server = await startServer({ env: { MCP_ALLOWED_KEYS } }); // sem N8N_SSRF_MODE -> default "moderate"
    headers = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
});

after(async () => {
    await server.stop();
    await fakeN8n.close();
});

test("modo default (moderate): webhookUrl em loopback é bloqueado antes do fetch", async () => {
    const before = fakeN8n.requests.filter((r) => r.url === "/webhook-test/success").length;
    const { body } = await callTool(server.baseUrl, headers, "execute_workflow_via_webhook", {
        webhookUrl: `${fakeN8n.baseUrl}/webhook-test/success`
    });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /SSRF guard/);
    const after = fakeN8n.requests.filter((r) => r.url === "/webhook-test/success").length;
    assert.equal(after, before, "não deve chegar a chamar o destino quando o guard bloqueia");
});

test("modo off via env: libera loopback explicitamente", async () => {
    const offServer = await startServer({ env: { MCP_ALLOWED_KEYS, N8N_SSRF_MODE: "off" } });
    try {
        const offHeaders = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
        const { body } = await callTool(offServer.baseUrl, offHeaders, "execute_workflow_via_webhook", {
            webhookUrl: `${fakeN8n.baseUrl}/webhook-test/success`
        });
        assert.equal(body.result.isError, undefined);
        assert.match(body.result.content[0].text, /Webhook OK \(200\)/);
    } finally {
        await offServer.stop();
    }
});
