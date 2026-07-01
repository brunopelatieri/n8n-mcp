// test/helpers/run-node-script.js
//
// Roda um script Node.js em processo filho síncrono, com um env "limpo"
// (sem vazar secrets do processo pai) mais o que for passado explicitamente.
// Usado para testar secrets-reader.js, cuja lógica roda como side-effect
// do import (top-level), sem nenhuma função exportada para chamar direto.

import { spawnSync } from "node:child_process";

const SECRET_ENV_KEYS = [
    "N8N_URL", "N8N_API_KEY", "MCP_ALLOWED_KEYS",
    "N8N_URL_FILE", "N8N_API_KEY_FILE", "MCP_ALLOWED_KEYS_FILE"
];

/**
 * @param {string} scriptPath  caminho absoluto do script a rodar
 * @param {object} [env]       variáveis extras/sobrescritas para o processo filho
 * @returns {{ stdout: string, stderr: string, status: number|null }}
 */
export function runNodeScript(scriptPath, env = {}) {
    const cleanEnv = { ...process.env };
    for (const key of SECRET_ENV_KEYS) delete cleanEnv[key];

    const result = spawnSync(process.execPath, [scriptPath], {
        env: { ...cleanEnv, ...env },
        encoding: "utf8"
    });

    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

/** Extrai e faz parse da última linha não vazia do stdout (usado pelo print-secrets-env.js). */
export function lastJsonLine(stdout) {
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    return JSON.parse(lines.at(-1));
}
