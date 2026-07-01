// test/tools-generate-workflow-draft.test.js
//
// Cobre a tool opt-in generate_workflow_draft (Task 6, SPEC seção 5.2.1 +
// seção 7 item 8): erro claro quando falta X-LLM-API-KEY, happy path com a
// chave presente, e o requisito crítico de segurança — a chave de LLM nunca
// pode aparecer em nenhuma mensagem de erro devolvida ao cliente MCP nem em
// nada escrito em stdout/stderr do processo do servidor. O fetch ao provedor
// é sempre redirecionado para um servidor fake local via LLM_OPENAI_BASE_URL;
// a API real de nenhum provedor de LLM é chamada nos testes.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";
import { startFakeServer } from "./helpers/fake-http.js";
import { callTool, authHeaders } from "./helpers/mcp-client.js";
import { n8nFakeHandler } from "./fixtures/fake-n8n.js";
import { llmFakeHandler } from "./fixtures/fake-llm.js";

const MCP_ALLOWED_KEYS = "alice:alice-key-123";
const SECRET_LLM_KEY = "sk-llm-super-secret-abc123";

let server;
let fakeN8n;
let fakeLlm;
let headersNoLlm;
let headersWithLlm;

before(async () => {
    fakeN8n = await startFakeServer(n8nFakeHandler);
    fakeLlm = await startFakeServer(llmFakeHandler);
    server = await startServer({
        env: {
            MCP_ALLOWED_KEYS,
            N8N_SSRF_MODE: "off",
            LLM_OPENAI_BASE_URL: `${fakeLlm.baseUrl}/v1/chat/completions`
        }
    });
    headersNoLlm   = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl });
    headersWithLlm = authHeaders({ mcpKey: "alice-key-123", n8nUrl: fakeN8n.baseUrl, llmApiKey: SECRET_LLM_KEY });
});

after(async () => {
    await server.stop();
    await fakeN8n.close();
    await fakeLlm.close();
});

// ─── tools/list nunca exige a chave ──────────────────────────────────────────

test("generate_workflow_draft aparece normalmente em tools/list mesmo sem X-LLM-API-KEY", async () => {
    const { body } = await callTool(server.baseUrl, headersNoLlm, "get_workflow", { id: "1" });
    assert.equal(body.result.isError, undefined, "sanity check: servidor funciona sem X-LLM-API-KEY");
});

// ─── erro claro quando falta a chave ─────────────────────────────────────────

test("generate_workflow_draft: sem X-LLM-API-KEY -> erro explicativo, não chama o provedor", async () => {
    const before = fakeLlm.requests.length;
    const { body } = await callTool(server.baseUrl, headersNoLlm, "generate_workflow_draft", { description: "um workflow simples" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /X-LLM-API-KEY/);
    assert.equal(fakeLlm.requests.length, before, "não deve chamar o provedor sem a chave");
});

test("generate_workflow_draft: sem description -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headersWithLlm, "generate_workflow_draft", {});
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /'description' é obrigatório/);
});

// ─── happy path ───────────────────────────────────────────────────────────────

test("generate_workflow_draft: happy path com chave presente devolve o JSON proposto", async () => {
    const { body } = await callTool(server.baseUrl, headersWithLlm, "generate_workflow_draft", { description: "workflow de teste" });
    assert.equal(body.result.isError, undefined);
    const draft = JSON.parse(body.result.content[0].text);
    assert.equal(draft.name, "Draft: workflow de teste");
    assert.ok(Array.isArray(draft.nodes));
    assert.ok(draft.connections !== undefined);

    const llmReq = fakeLlm.requests.at(-1);
    assert.equal(llmReq.headers["authorization"], `Bearer ${SECRET_LLM_KEY}`);
    const sentBody = JSON.parse(llmReq.body);
    assert.equal(sentBody.messages.find((m) => m.role === "user").content, "workflow de teste");
});

test("generate_workflow_draft: provedor devolve JSON inválido -> erro claro", async () => {
    const { body } = await callTool(server.baseUrl, headersWithLlm, "generate_workflow_draft", { description: "trigger-invalid-json" });
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /não devolveu um JSON válido/);
});

// ─── requisito crítico de segurança: a chave nunca vaza ──────────────────────

test("generate_workflow_draft: erro do provedor NUNCA vaza a chave na mensagem devolvida ao cliente MCP nem em stdout/stderr", async () => {
    const stdoutBefore = server.stdout.join("").length;
    const stderrBefore = server.stderr.join("").length;

    const { body } = await callTool(server.baseUrl, headersWithLlm, "generate_workflow_draft", { description: "trigger-llm-error" });
    assert.equal(body.result.isError, true);
    const errorText = body.result.content[0].text;
    assert.equal(errorText.includes(SECRET_LLM_KEY), false, "chave não pode aparecer na mensagem de erro");

    await new Promise((r) => setTimeout(r, 100));
    const newStdout = server.stdout.join("").slice(stdoutBefore);
    const newStderr = server.stderr.join("").slice(stderrBefore);
    assert.equal(newStdout.includes(SECRET_LLM_KEY), false, "chave não pode aparecer em stdout");
    assert.equal(newStderr.includes(SECRET_LLM_KEY), false, "chave não pode aparecer em stderr");
});

test("generate_workflow_draft: happy path também nunca escreve a chave em stdout/stderr", async () => {
    const stdoutBefore = server.stdout.join("").length;
    const stderrBefore = server.stderr.join("").length;

    await callTool(server.baseUrl, headersWithLlm, "generate_workflow_draft", { description: "outro workflow" });

    await new Promise((r) => setTimeout(r, 100));
    const newStdout = server.stdout.join("").slice(stdoutBefore);
    const newStderr = server.stderr.join("").slice(stderrBefore);
    assert.equal(newStdout.includes(SECRET_LLM_KEY), false);
    assert.equal(newStderr.includes(SECRET_LLM_KEY), false);
});
