// test/health.test.js
//
// Cobre as rotas públicas (sem autenticação MCP): /health e os
// endpoints .well-known usados por alguns clientes MCP para descoberta
// de OAuth (que este servidor não implementa, e deve responder 404).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./helpers/spawn-server.js";

let server;

before(async () => {
    server = await startServer({});
});

after(async () => {
    await server.stop();
});

test("GET /health responde 200 com status ok e time ISO", async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.ok(typeof body.time === "string");
    assert.ok(!Number.isNaN(Date.parse(body.time)), "time deve ser uma data ISO válida");
});

test("GET /.well-known/oauth-authorization-server responde 404", async () => {
    const res = await fetch(`${server.baseUrl}/.well-known/oauth-authorization-server`);
    assert.equal(res.status, 404);
});

test("GET /.well-known/openid-configuration responde 404", async () => {
    const res = await fetch(`${server.baseUrl}/.well-known/openid-configuration`);
    assert.equal(res.status, 404);
});
