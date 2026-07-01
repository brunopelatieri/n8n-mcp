// test/ssrf-guard.test.js
//
// Testes unitários de src/ssrf-guard.js (novo módulo — Task 1).
// Cobrem bloqueio de loopback e metadata (169.254.169.254) e o comportamento
// dos modos off / moderate / strict. Usam apenas literais de IP e "localhost"
// (que o guard trata como loopback sem depender de DNS externo), portanto são
// determinísticos e não fazem rede.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeUrl, resolveMode } from "../src/ssrf-guard.js";

async function isBlocked(url, opts) {
    try {
        await assertSafeUrl(url, opts);
        return false;
    } catch {
        return true;
    }
}

// ─── modo "off" ─────────────────────────────────────────────────────────────

test("off: permite qualquer destino, inclusive loopback e metadata", async () => {
    assert.equal(await isBlocked("http://127.0.0.1/x",       { mode: "off" }), false);
    assert.equal(await isBlocked("http://localhost/x",       { mode: "off" }), false);
    assert.equal(await isBlocked("http://169.254.169.254/x", { mode: "off" }), false);
    assert.equal(await isBlocked("http://10.0.0.5/x",        { mode: "off" }), false);
});

// ─── loopback (bloqueado em moderate e strict) ──────────────────────────────

test("moderate: bloqueia loopback (127.0.0.1, localhost, 0.0.0.0, ::1)", async () => {
    assert.equal(await isBlocked("http://127.0.0.1/x",   { mode: "moderate" }), true);
    assert.equal(await isBlocked("http://127.99.0.1/x",  { mode: "moderate" }), true);
    assert.equal(await isBlocked("http://localhost/x",   { mode: "moderate" }), true);
    assert.equal(await isBlocked("http://0.0.0.0/x",     { mode: "moderate" }), true);
    assert.equal(await isBlocked("http://[::1]/x",       { mode: "moderate" }), true);
});

test("strict: também bloqueia loopback", async () => {
    assert.equal(await isBlocked("http://127.0.0.1/x", { mode: "strict" }), true);
    assert.equal(await isBlocked("http://localhost/x", { mode: "strict" }), true);
});

// ─── metadata de nuvem 169.254.169.254 ──────────────────────────────────────

test("moderate: bloqueia metadata de nuvem 169.254.169.254", async () => {
    assert.equal(await isBlocked("http://169.254.169.254/latest/meta-data/", { mode: "moderate" }), true);
});

test("strict: bloqueia metadata de nuvem 169.254.169.254", async () => {
    assert.equal(await isBlocked("http://169.254.169.254/", { mode: "strict" }), true);
});

// ─── IP privado: permitido em moderate, bloqueado em strict ─────────────────

test("moderate: PERMITE IP privado (rede interna de self-hosted)", async () => {
    assert.equal(await isBlocked("http://10.0.0.5/x",     { mode: "moderate" }), false);
    assert.equal(await isBlocked("http://172.16.3.4/x",   { mode: "moderate" }), false);
    assert.equal(await isBlocked("http://192.168.1.10/x", { mode: "moderate" }), false);
});

test("strict: bloqueia IP privado (RFC1918)", async () => {
    assert.equal(await isBlocked("http://10.0.0.5/x",     { mode: "strict" }), true);
    assert.equal(await isBlocked("http://172.16.3.4/x",   { mode: "strict" }), true);
    assert.equal(await isBlocked("http://192.168.1.10/x", { mode: "strict" }), true);
    assert.equal(await isBlocked("http://[fe80::1]/x",    { mode: "strict" }), true);
    assert.equal(await isBlocked("http://[fc00::1]/x",    { mode: "strict" }), true);
});

// ─── host público é permitido ───────────────────────────────────────────────

test("moderate e strict: permitem IP público comum", async () => {
    assert.equal(await isBlocked("http://8.8.8.8/x", { mode: "moderate" }), false);
    assert.equal(await isBlocked("http://8.8.8.8/x", { mode: "strict" }),   false);
});

// ─── URL inválida ───────────────────────────────────────────────────────────

test("URL inválida lança erro (exceto em modo off)", async () => {
    assert.equal(await isBlocked("nao-e-uma-url",  { mode: "moderate" }), true);
    assert.equal(await isBlocked("nao-e-uma-url",  { mode: "off" }),      false);
});

// ─── resolveMode (env) ──────────────────────────────────────────────────────

test("resolveMode: default moderate; respeita N8N_SSRF_MODE válido; ignora inválido", () => {
    const prev = process.env.N8N_SSRF_MODE;
    try {
        delete process.env.N8N_SSRF_MODE;
        assert.equal(resolveMode(), "moderate");

        process.env.N8N_SSRF_MODE = "strict";
        assert.equal(resolveMode(), "strict");

        process.env.N8N_SSRF_MODE = "off";
        assert.equal(resolveMode(), "off");

        process.env.N8N_SSRF_MODE = "banana";
        assert.equal(resolveMode(), "moderate");
    } finally {
        if (prev === undefined) delete process.env.N8N_SSRF_MODE;
        else process.env.N8N_SSRF_MODE = prev;
    }
});
