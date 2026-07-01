// test/secrets-reader.test.js
//
// Cobre secrets-reader.js: leitura de Docker secrets (_FILE -> process.env),
// precedência de valor já definido, arquivo ausente/vazio. Como o módulo
// não exporta nenhuma função (a lógica roda como side-effect do import),
// cada cenário é testado em um processo filho isolado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { runNodeScript, lastJsonLine } from "./helpers/run-node-script.js";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "fixtures", "print-secrets-env.js");

function withTempFile(content, fn) {
    const dir = mkdtempSync(path.join(os.tmpdir(), "n8n-mcp-secrets-test-"));
    const filePath = path.join(dir, "secret.txt");
    if (content !== null) writeFileSync(filePath, content, "utf8");
    try {
        return fn(filePath);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test("sem nenhuma _FILE definida -> todos os targets ficam undefined, sem crash", () => {
    const { status, stdout } = runNodeScript(SCRIPT_PATH);
    assert.equal(status, 0);
    const result = lastJsonLine(stdout);
    assert.deepEqual(result, { N8N_URL: null, N8N_API_KEY: null, MCP_ALLOWED_KEYS: null });
});

test("N8N_URL_FILE aponta para arquivo válido -> N8N_URL é carregado e trimado", () => {
    withTempFile("  https://test-n8n.example.com  \n", (filePath) => {
        const { status, stdout } = runNodeScript(SCRIPT_PATH, { N8N_URL_FILE: filePath });
        assert.equal(status, 0);
        const result = lastJsonLine(stdout);
        assert.equal(result.N8N_URL, "https://test-n8n.example.com");
    });
});

test("valor já definido em N8N_URL não é sobrescrito pelo arquivo", () => {
    withTempFile("https://from-file.example.com", (filePath) => {
        const { stdout } = runNodeScript(SCRIPT_PATH, { N8N_URL_FILE: filePath, N8N_URL: "https://already-set.example.com" });
        const result = lastJsonLine(stdout);
        assert.equal(result.N8N_URL, "https://already-set.example.com");
    });
});

test("N8N_API_KEY_FILE aponta para arquivo inexistente -> alerta e target continua ausente", () => {
    const { status, stdout, stderr } = runNodeScript(SCRIPT_PATH, {
        N8N_API_KEY_FILE: "C:\\caminho\\que\\nao\\existe\\secret.txt"
    });
    assert.equal(status, 0); // nunca derruba o processo
    assert.equal(lastJsonLine(stdout).N8N_API_KEY, null);
    assert.match(stderr, /arquivo não encontrado/);
});

test("MCP_ALLOWED_KEYS_FILE aponta para arquivo vazio -> alerta e target continua ausente", () => {
    withTempFile("   \n", (filePath) => {
        const { status, stdout, stderr } = runNodeScript(SCRIPT_PATH, { MCP_ALLOWED_KEYS_FILE: filePath });
        assert.equal(status, 0);
        assert.equal(lastJsonLine(stdout).MCP_ALLOWED_KEYS, null);
        assert.match(stderr, /arquivo vazio/);
    });
});

test("as três secrets carregadas simultaneamente, cada uma do seu arquivo", () => {
    withTempFile("https://n8n-1.example.com", (urlFile) => {
        withTempFile("api-key-abc", (keyFile) => {
            withTempFile("bruno:chave1,joao:chave2", (keysFile) => {
                const { stdout } = runNodeScript(SCRIPT_PATH, {
                    N8N_URL_FILE: urlFile,
                    N8N_API_KEY_FILE: keyFile,
                    MCP_ALLOWED_KEYS_FILE: keysFile
                });
                const result = lastJsonLine(stdout);
                assert.deepEqual(result, {
                    N8N_URL: "https://n8n-1.example.com",
                    N8N_API_KEY: "api-key-abc",
                    MCP_ALLOWED_KEYS: "bruno:chave1,joao:chave2"
                });
            });
        });
    });
});
