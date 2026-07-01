// test/helpers/spawn-server.js
//
// Sobe index.js como processo filho real (node index.js), com env controlado
// e porta dedicada. Isso permite testar o servidor de ponta a ponta via HTTP
// sem modificar index.js (que hoje não exporta nada e chama app.listen() como
// side-effect do import).
//
// Nenhuma dependência nova: só node:child_process + fetch nativo (Node >=18).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const INDEX_JS  = path.join(REPO_ROOT, "index.js");

// Variáveis de ambiente que NUNCA devem vazar do processo pai (shell do dev/CI)
// para o processo filho, para manter cada teste isolado e determinístico.
const SECRET_ENV_KEYS = [
    "N8N_URL", "N8N_API_KEY", "MCP_ALLOWED_KEYS",
    "N8N_URL_FILE", "N8N_API_KEY_FILE", "MCP_ALLOWED_KEYS_FILE"
];

/**
 * Sobe uma instância de index.js em processo filho.
 *
 * `node --test` roda cada arquivo de teste em um processo separado, cada um
 * com seu próprio contador de portas — por isso, se nenhuma porta explícita
 * for passada, tenta portas aleatórias com retry em caso de EADDRINUSE
 * (colisão entre arquivos de teste rodando em paralelo).
 *
 * @param {object} opts
 * @param {number} [opts.port]        Porta explícita (se omitida, aloca aleatória com retry)
 * @param {object} [opts.env]         Variáveis extras/sobrescritas (ex.: MCP_ALLOWED_KEYS)
 * @param {number} [opts.timeoutMs]   Timeout de espera pelo servidor ficar pronto (padrão 5000)
 * @param {number} [opts.maxRetries]  Tentativas em caso de porta ocupada (padrão 5)
 * @returns {Promise<{ port: number, baseUrl: string, stop: () => Promise<void>, stdout: string[], stderr: string[] }>}
 */
export async function startServer({ port, env = {}, timeoutMs = 5000, maxRetries = 5 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const usePort = port ?? allocPort();
        try {
            return await trySpawn(usePort, env, timeoutMs);
        } catch (e) {
            const portBusy = /EADDRINUSE/.test(e.message);
            if (portBusy && port === undefined) { lastErr = e; continue; } // tenta outra porta aleatória
            throw e;
        }
    }
    throw lastErr;
}

function trySpawn(port, env, timeoutMs) {
    return new Promise((resolve, reject) => {
        const cleanEnv = { ...process.env };
        for (const key of SECRET_ENV_KEYS) delete cleanEnv[key];

        const child = spawn(process.execPath, [INDEX_JS], {
            cwd: REPO_ROOT,
            env: { ...cleanEnv, PORT: String(port), NODE_ENV: "test", ...env },
            stdio: ["ignore", "pipe", "pipe"]
        });

        const stdout = [];
        const stderr = [];
        child.stdout.on("data", (d) => stdout.push(d.toString()));
        child.stderr.on("data", (d) => stderr.push(d.toString()));

        let settled = false;
        child.on("exit", (code, signal) => {
            if (settled) return;
            settled = true;
            reject(new Error(
                `Servidor encerrou antes de ficar pronto (code=${code}, signal=${signal}).\n` +
                `stdout:\n${stdout.join("")}\nstderr:\n${stderr.join("")}`
            ));
        });

        const baseUrl = `http://127.0.0.1:${port}`;
        const deadline = Date.now() + timeoutMs;

        (async () => {
            while (Date.now() < deadline) {
                if (settled) return;
                try {
                    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(300) });
                    if (res.ok && !settled) {
                        settled = true;
                        return resolve({ port, baseUrl, stdout, stderr, stop: () => stopChild(child) });
                    }
                } catch {
                    // ainda não está de pé, tenta de novo
                }
                await new Promise((r) => setTimeout(r, 50));
            }
            if (!settled) {
                settled = true;
                await stopChild(child);
                reject(new Error(
                    `Timeout esperando servidor ficar pronto em ${baseUrl}/health.\n` +
                    `stdout:\n${stdout.join("")}\nstderr:\n${stderr.join("")}`
                ));
            }
        })();
    });
}

function stopChild(child) {
    return new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill();
        // Fallback: se não morrer graciosamente, força depois de 2s
        setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 2000).unref();
    });
}

/**
 * Aloca uma porta pseudo-aleatória (faixa alta, pouco usada). Não garante
 * unicidade sozinha — startServer() já faz retry em EADDRINUSE, então isso
 * só reduz a chance de colisão entre processos de teste rodando em paralelo.
 */
export function allocPort() {
    return 34000 + Math.floor(Math.random() * 20000);
}
