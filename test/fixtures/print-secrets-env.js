// test/fixtures/print-secrets-env.js
//
// Script auxiliar rodado em processo filho (via test/helpers/run-node-script.js):
// importa secrets-reader.js (que roda sua lógica como side-effect do import,
// lendo _FILE -> process.env) e imprime o resultado em JSON na última linha
// do stdout, para o teste inspecionar sem precisar mockar nada.

import "../../secrets-reader.js";

console.log(JSON.stringify({
    N8N_URL:          process.env.N8N_URL ?? null,
    N8N_API_KEY:      process.env.N8N_API_KEY ?? null,
    MCP_ALLOWED_KEYS: process.env.MCP_ALLOWED_KEYS ?? null
}));
