// test/helpers/fake-http.js
//
// Servidor HTTP fake minimalista (node:http puro, zero dependências) usado
// para simular a API REST do n8n e endpoints de webhook nos testes, sem
// nenhuma chamada de rede real.

import http from "node:http";

/**
 * Sobe um servidor HTTP fake numa porta livre escolhida pelo SO.
 *
 * @param {(req: { method: string, url: string, headers: object, body: string }) => { status?: number, json?: any, text?: string, headers?: object }} handler
 * @returns {Promise<{ baseUrl: string, port: number, requests: Array, close: () => Promise<void> }>}
 */
export async function startFakeServer(handler) {
    const requests = [];

    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            const record = { method: req.method, url: req.url, headers: req.headers, body };
            requests.push(record);

            let result;
            try {
                result = handler(record) ?? { status: 404, json: { error: "not found" } };
            } catch (e) {
                result = { status: 500, json: { error: e.message } };
            }

            const status = result.status ?? 200;
            const extraHeaders = result.headers ?? {};

            if (result.json !== undefined) {
                res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
                res.end(JSON.stringify(result.json));
            } else {
                res.writeHead(status, { "Content-Type": "text/plain", ...extraHeaders });
                res.end(result.text ?? "");
            }
        });
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        port,
        requests,
        close: () => new Promise((resolve) => server.close(() => resolve()))
    };
}
