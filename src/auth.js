// src/auth.js
//
// Autenticação MCP por usuário nomeado. Extraída da lógica antes embutida
// no handler POST /mcp do index.js — comportamento 1:1.
//
// Modelo de auth (não-negociável, ver SPEC seção 7 item 7):
//   MCP_ALLOWED_KEYS = "nome1:chave1,nome2:chave2,..." (secret Docker)
//   X-MCP-KEY do cliente é validada contra essa lista; cada usuário é
//   nomeado e individualmente revogável. NÃO há token único compartilhado.

/**
 * Parseia "nome:chave,nome:chave,..." em um Map { chave => nome }.
 * A chave pode conter ":" (o primeiro ":" separa nome do resto).
 *
 * @param {string} rawKeys
 * @returns {Map<string, string>}
 */
export function parseAllowedKeys(rawKeys) {
    return new Map(
        (rawKeys ?? "")
            .split(",")
            .map((e) => e.trim().split(":"))
            .filter(([n, k]) => n && k)
            .map(([name, ...rest]) => [rest.join(":"), name])
    );
}

/**
 * Middleware Express que valida X-MCP-KEY contra MCP_ALLOWED_KEYS.
 *
 * - Métodos `notifications/*` dispensam autenticação (segue para next()).
 * - Sem MCP_ALLOWED_KEYS configurado no servidor -> 500.
 * - X-MCP-KEY ausente ou inválida -> 401.
 * - Sucesso -> loga o usuário autenticado e segue.
 */
export function mcpAuth(req, res, next) {
    const method = req.body?.method;

    if (method?.startsWith("notifications/")) return next();

    const clientKey = req.headers["x-mcp-key"] ?? "";
    const rawKeys   = process.env.MCP_ALLOWED_KEYS ?? "";

    if (!rawKeys) {
        console.log(`[auth] MCP_ALLOWED_KEYS não configurado no servidor`);
        return res.status(500).json({ jsonrpc: "2.0", error: { code: -32000, message: "Servidor mal configurado: MCP_ALLOWED_KEYS ausente" }, id: req.body?.id ?? null });
    }

    const keyMap = parseAllowedKeys(rawKeys);

    if (!clientKey || !keyMap.has(clientKey)) {
        console.log(`[auth] chave inválida ou ausente: "${clientKey.slice(0, 8)}..."`);
        return res.status(401).json({ jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized: X-MCP-KEY inválida ou ausente" }, id: req.body?.id ?? null });
    }

    console.log(`[auth] usuário autenticado: ${keyMap.get(clientKey)}`);
    next();
}
