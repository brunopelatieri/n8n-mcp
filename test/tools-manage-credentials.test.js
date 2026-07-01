// test/tools-manage-credentials.test.js
//
// Cobre a tool manage_credentials (Task 4, SPEC seção 5.2 + seção 7 item 3):
// caminho feliz de cada action, erros de input inválido e o requisito crítico
// de segurança — o campo `data` (valores sensíveis da credencial) nunca pode
// aparecer em mensagens de erro devolvidas ao cliente MCP nem em nada escrito
// em stdout/stderr do processo do servidor.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { callTool, authHeaders } from "./helpers/mcp-client.js";
import { n8nFakeHandler } from "./fixtures/fake-n8n.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";
const SECRET_VALUE = "sk-super-secret-token-xyz";

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

// ─── caminho feliz de cada action ───────────────────────────────────────────

test("manage_credentials: list retorna as credenciais (sem data)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "list" });
    const dump = JSON.parse(body.result.content[0].text);
    assert.deepEqual(dump.data, [{ id: "c1", name: "Minha API", type: "httpBasicAuth" }]);
});

test("manage_credentials: get retorna a credencial pelo id", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "get", id: "c1" });
    const dump = JSON.parse(body.result.content[0].text);
    assert.deepEqual(dump, { id: "c1", name: "Minha API", type: "httpBasicAuth" });
});

test("manage_credentials: create com name/type/data válidos", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", {
        action: "create", name: "Nova API", type: "httpBasicAuth", data: { user: "admin", password: SECRET_VALUE }
    });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.deepEqual(dump, { id: "c-new", name: "Nova API", type: "httpBasicAuth" });
    assert.equal(JSON.stringify(dump).includes(SECRET_VALUE), false);
});

test("manage_credentials: update de credencial existente", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", {
        action: "update", id: "c1", name: "Renomeada", data: { password: SECRET_VALUE }
    });
    assert.equal(body.result.isError, undefined);
    const dump = JSON.parse(body.result.content[1].text);
    assert.equal(dump.name, "Renomeada");
    assert.equal(JSON.stringify(dump).includes(SECRET_VALUE), false);
});

test("manage_credentials: delete remove a credencial", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "delete", id: "c1" });
    assert.equal(body.result.isError, undefined);
    assert.match(body.result.content[0].text, /Credencial c1 removida/);
});

test("manage_credentials: getSchema retorna o schema do tipo", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "getSchema", type: "httpBasicAuth" });
    const dump = JSON.parse(body.result.content[0].text);
    assert.equal(dump.type, "httpBasicAuth");
    assert.ok(dump.properties.password);
});

// ─── erros / input inválido ──────────────────────────────────────────────────

test("manage_credentials: create sem name/type -> erro claro, não chama a API", async () => {
    const before = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/credentials").length;
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "create", data: { password: SECRET_VALUE } });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'name' e 'type' são obrigatórios/);
    const after = fakeN8n.requests.filter((r) => r.method === "POST" && r.url === "/api/v1/credentials").length;
    assert.equal(after, before);
});

test("manage_credentials: get sem id -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "get" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'id' é obrigatório/);
});

test("manage_credentials: id inexistente -> erro propagado (sem data, não se aplica aqui)", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "get", id: "404" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /404/);
});

test("manage_credentials: action desconhecida -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", { action: "bogus" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /action desconhecida/);
});

// ─── requisito crítico de segurança: redação de `data` ──────────────────────

test("manage_credentials: erro em create NUNCA vaza 'data' na mensagem devolvida ao cliente MCP nem em stdout/stderr", async () => {
    const stdoutBefore = server.stdout.join("").length;
    const stderrBefore = server.stderr.join("").length;

    const { body } = await callTool(server.baseUrl, headers, "manage_credentials", {
        action: "create",
        name: "trigger-error",
        type: "httpBasicAuth",
        data: { apiKey: SECRET_VALUE }
    });

    // A tool deve reportar o erro normalmente (isError:true), só o conteúdo é que é redigido.
    assert.equal(body.result.isError, true);
    const errorText = body.result.content[0].text;
    assert.equal(errorText.includes(SECRET_VALUE), false, "valor sensível não pode aparecer na mensagem de erro");
    assert.equal(errorText.includes('"data"'), false, "campo 'data' não pode aparecer (nem redigido) na mensagem de erro");
    assert.match(errorText, /redigid/i);

    // Dá um tempo para qualquer log assíncrono do processo filho ser capturado.
    await new Promise((r) => setTimeout(r, 100));
    const newStdout = server.stdout.join("").slice(stdoutBefore);
    const newStderr = server.stderr.join("").slice(stderrBefore);
    assert.equal(newStdout.includes(SECRET_VALUE), false, "valor sensível não pode aparecer em stdout");
    assert.equal(newStderr.includes(SECRET_VALUE), false, "valor sensível não pode aparecer em stderr");
    assert.equal(newStdout.includes("apiKey"), false, "chave de dentro de 'data' não pode aparecer em stdout");
    assert.equal(newStderr.includes("apiKey"), false, "chave de dentro de 'data' não pode aparecer em stderr");
});
