// test/n8n-client.test.js
//
// Testes unitários (em processo, sem spawn-server.js) de src/n8n-client.js —
// Task 8, itens 1 e 2:
//   1. SSRF: request()/rawRequest() devem validar o host de n8nUrl via
//      ssrf-guard.js antes de qualquer fetch real.
//   2. Erros padronizados: falhas da API do n8n devem virar N8nApiError com
//      status/code/message estáveis, e a API key nunca pode aparecer numa
//      mensagem de erro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createN8nClient, N8nApiError } from "../src/n8n-client.js";
import { startFakeServer } from "./helpers/fake-http.js";

const API_KEY = "super-secret-key-999";

// ─── SSRF (item 1) ──────────────────────────────────────────────────────────

test("SSRF: modo default (moderate) bloqueia n8nUrl em loopback antes do fetch", async () => {
    const prev = process.env.N8N_SSRF_MODE;
    delete process.env.N8N_SSRF_MODE;
    try {
        const client = createN8nClient("http://127.0.0.1:1", API_KEY);
        await assert.rejects(() => client.workflows.list(), (e) => {
            assert.ok(e instanceof N8nApiError);
            assert.match(e.message, /SSRF guard/);
            return true;
        });
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE; else process.env.N8N_SSRF_MODE = prev;
    }
});

test("SSRF: N8N_SSRF_MODE=off libera loopback e chega a fazer a chamada real", async () => {
    const fake = await startFakeServer(() => ({ json: { data: [] } }));
    const prev = process.env.N8N_SSRF_MODE;
    process.env.N8N_SSRF_MODE = "off";
    try {
        const client = createN8nClient(fake.baseUrl, API_KEY);
        const result = await client.workflows.list();
        assert.deepEqual(result, { data: [] });
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE; else process.env.N8N_SSRF_MODE = prev;
        await fake.close();
    }
});

test("SSRF: rawRequest() também é bloqueado no modo default", async () => {
    const prev = process.env.N8N_SSRF_MODE;
    delete process.env.N8N_SSRF_MODE;
    try {
        const client = createN8nClient("http://127.0.0.1:1", API_KEY);
        await assert.rejects(() => client.health.check(), /SSRF guard/);
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE; else process.env.N8N_SSRF_MODE = prev;
    }
});

// ─── N8nApiError padronizado (item 2) ───────────────────────────────────────

test("N8nApiError: mapeia status HTTP para code estável (400/401/404/429/500)", async () => {
    const fake = await startFakeServer((req) => {
        const status = Number(new URL(req.url, "http://x").searchParams.get("status"));
        return { status, text: `falhou com ${status}` };
    });
    const prev = process.env.N8N_SSRF_MODE;
    process.env.N8N_SSRF_MODE = "off";
    try {
        const client = createN8nClient(fake.baseUrl, API_KEY);
        const cases = [
            [400, "VALIDATION_ERROR"],
            [401, "AUTHENTICATION_ERROR"],
            [404, "NOT_FOUND"],
            [429, "RATE_LIMIT_ERROR"],
            [500, "SERVER_ERROR"],
            [418, "API_ERROR"]
        ];
        for (const [status, code] of cases) {
            await assert.rejects(() => client.request(`/x?status=${status}`), (e) => {
                assert.ok(e instanceof N8nApiError, `status ${status} deveria lançar N8nApiError`);
                assert.equal(e.status, status);
                assert.equal(e.code, code);
                return true;
            });
        }
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE; else process.env.N8N_SSRF_MODE = prev;
        await fake.close();
    }
});

test("N8nApiError: a API key nunca aparece na mensagem de erro", async () => {
    const fake = await startFakeServer(() => ({ status: 500, text: "erro interno do n8n" }));
    const prev = process.env.N8N_SSRF_MODE;
    process.env.N8N_SSRF_MODE = "off";
    try {
        const client = createN8nClient(fake.baseUrl, API_KEY);
        await assert.rejects(() => client.workflows.list(), (e) => {
            assert.equal(e.message.includes(API_KEY), false);
            return true;
        });
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE; else process.env.N8N_SSRF_MODE = prev;
        await fake.close();
    }
});

test("N8nApiError: erro de rede/timeout vira REQUEST_ERROR sem quebrar o formato padronizado", async () => {
    const prev = process.env.N8N_SSRF_MODE;
    process.env.N8N_SSRF_MODE = "off";
    try {
        // Porta sem servidor nenhum escutando -> ECONNREFUSED.
        const client = createN8nClient("http://127.0.0.1:1", API_KEY);
        await assert.rejects(() => client.workflows.list(), (e) => {
            assert.ok(e instanceof N8nApiError);
            assert.equal(e.code, "REQUEST_ERROR");
            assert.equal(e.message.includes(API_KEY), false);
            return true;
        });
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE; else process.env.N8N_SSRF_MODE = prev;
    }
});
