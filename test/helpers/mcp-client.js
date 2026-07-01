// test/helpers/mcp-client.js
//
// Cliente MCP mínimo para os testes: monta requisições JSON-RPC 2.0 contra
// POST /mcp usando fetch nativo (Node >=18), sem dependências novas.

let nextId = 1;

/**
 * Faz uma chamada JSON-RPC crua contra POST /mcp.
 *
 * @param {string} baseUrl
 * @param {object} headers        headers extras (ex.: X-MCP-KEY, X-N8N-URL, X-N8N-API-KEY)
 * @param {string} method         método JSON-RPC (initialize, tools/list, tools/call, ping, notifications/...)
 * @param {object} [params]
 * @returns {Promise<{ status: number, body: any }>}
 */
export async function rpc(baseUrl, headers, method, params) {
    const id = method.startsWith("notifications/") ? undefined : nextId++;
    const res = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
}

/**
 * Atalho para tools/call.
 */
export async function callTool(baseUrl, headers, toolName, args = {}) {
    return rpc(baseUrl, headers, "tools/call", { name: toolName, arguments: args });
}

/**
 * Monta o conjunto padrão de headers exigidos (MCP + n8n).
 */
export function authHeaders({ mcpKey, n8nUrl, n8nApiKey = "test-api-key", llmApiKey, llmProvider }) {
    const headers = {};
    if (mcpKey !== undefined) headers["X-MCP-KEY"] = mcpKey;
    if (n8nUrl !== undefined) headers["X-N8N-URL"] = n8nUrl;
    if (n8nApiKey !== undefined) headers["X-N8N-API-KEY"] = n8nApiKey;
    if (llmApiKey !== undefined) headers["X-LLM-API-KEY"] = llmApiKey;
    if (llmProvider !== undefined) headers["X-LLM-PROVIDER"] = llmProvider;
    return headers;
}
