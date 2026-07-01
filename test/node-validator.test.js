// test/node-validator.test.js
//
// Cobre src/node-validator.js (SPEC seção 9.2.1.4) e os 3 formatos de regra
// presentes em data/node-validation-rules.json: requiredFields simples,
// resourceField+operationField (com sub-recurso) e operationField sozinho
// (sem seletor de resource, ex.: postgres/redis/ftp/supabase).

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNodeConfig } from "../src/node-validator.js";

test("node-type fora da lista curada -> known:false, sem errors/warnings", () => {
    const result = validateNodeConfig("n8n-nodes-base.notionUnknown", {});
    assert.deepEqual(result, { known: false, errors: [], warnings: [] });
});

// ─── requiredFields simples ─────────────────────────────────────────────────

test("httpRequest: url ausente -> warning", () => {
    const { known, errors, warnings } = validateNodeConfig("n8n-nodes-base.httpRequest", {});
    assert.equal(known, true);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"url"/);
});

test("httpRequest: url presente -> sem warnings", () => {
    const { warnings } = validateNodeConfig("n8n-nodes-base.httpRequest", { url: "https://example.com" });
    assert.equal(warnings.length, 0);
});

test("webhook: sem parameters -> sem warnings (path não é required de verdade)", () => {
    const { known, errors, warnings } = validateNodeConfig("n8n-nodes-base.webhook", {});
    assert.equal(known, true);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
});

// ─── resourceField + operationField (com sub-recurso) ───────────────────────

test("gmail: resource inválido -> error", () => {
    const { errors } = validateNodeConfig("n8n-nodes-base.gmail", { resource: "bogus" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /resource "bogus" inválido/);
});

test("gmail: resource válido, operation inválida -> error", () => {
    const { errors } = validateNodeConfig("n8n-nodes-base.gmail", { resource: "message", operation: "bogus" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /operation "bogus" inválida/);
});

test("gmail: message.send sem sendTo/subject/message -> 3 warnings", () => {
    const { known, errors, warnings } = validateNodeConfig("n8n-nodes-base.gmail", { resource: "message", operation: "send" });
    assert.equal(known, true);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 3);
});

test("gmail: message.send com sendTo/subject/message -> sem warnings", () => {
    const { warnings } = validateNodeConfig("n8n-nodes-base.gmail", {
        resource: "message", operation: "send", sendTo: "a@b.com", subject: "Oi", message: "Corpo do email"
    });
    assert.equal(warnings.length, 0);
});

test("gmail: só resource informado (operation ausente) -> não valida requiredFields", () => {
    const { errors, warnings } = validateNodeConfig("n8n-nodes-base.gmail", { resource: "message" });
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
});

// ─── operationField sozinho (sem resourceField) ─────────────────────────────

test("postgres: operation inválida -> error", () => {
    const { errors } = validateNodeConfig("n8n-nodes-base.postgres", { operation: "bogus" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /operation "bogus" inválida para n8n-nodes-base\.postgres/);
});

test("postgres: executeQuery sem query -> warning", () => {
    const { known, errors, warnings } = validateNodeConfig("n8n-nodes-base.postgres", { operation: "executeQuery" });
    assert.equal(known, true);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"query"/);
});

test("postgres: insert com table -> sem warnings", () => {
    const { warnings } = validateNodeConfig("n8n-nodes-base.postgres", { operation: "insert", table: "users" });
    assert.equal(warnings.length, 0);
});

test("supabase: getAll sem tableId -> warning", () => {
    const { warnings } = validateNodeConfig("n8n-nodes-base.supabase", { operation: "getAll" });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"tableId"/);
});

// ─── campo vazio ("") também conta como ausente ─────────────────────────────

test("campo presente mas vazio ('') -> ainda gera warning", () => {
    const { warnings } = validateNodeConfig("n8n-nodes-base.httpRequest", { url: "" });
    assert.equal(warnings.length, 1);
});
