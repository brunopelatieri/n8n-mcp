// src/llm-client.js
//
// Wrapper fino via node-fetch para endpoints de chat completion compatíveis
// com a API da OpenAI (sem SDK de IA como dependência). A chave de API é
// recebida por requisição (header X-LLM-API-KEY) — nunca é lida de
// process.env, nunca é persistida em disco/cache e nunca deve ser incluída
// em nenhuma mensagem de erro ou log (SPEC seção 7, item 8).

import fetch from "node-fetch";

const REQUEST_TIMEOUT_MS = 30000;

// Pequeno registro de providers com API de chat completion compatível com a
// OpenAI. Adicionar um novo provider é só adicionar uma entrada aqui. A env
// var de override do endpoint "openai" só existe para os testes apontarem a
// um servidor fake local — nunca é lida de header/input do cliente MCP.
const PROVIDER_ENDPOINTS = {
    openai:     { url: process.env.LLM_OPENAI_BASE_URL ?? "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
    openrouter: { url: "https://openrouter.ai/api/v1/chat/completions",  defaultModel: "openai/gpt-4o-mini" },
    groq:       { url: "https://api.groq.com/openai/v1/chat/completions", defaultModel: "llama-3.1-70b-versatile" }
};

const SYSTEM_PROMPT = [
    "Você gera RASCUNHOS de workflows do n8n a partir de uma descrição em linguagem natural.",
    "Responda APENAS com um objeto JSON válido, sem markdown e sem texto fora do JSON, no formato exato:",
    '{ "name": string, "nodes": [ { "name": string, "type": string, "typeVersion": number, "position": [number, number], "parameters": object } ], "connections": object }'
].join(" ");

/** Remove um bloco de código markdown (```json ... ```) ao redor da resposta, se houver. */
function stripCodeFences(text) {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : trimmed;
}

/**
 * Cria um cliente LLM vinculado a uma API key e provider por requisição.
 *
 * @param {string} [apiKey]    Valor de X-LLM-API-KEY (pode ser undefined/vazio)
 * @param {string} [provider]  Valor de X-LLM-PROVIDER (padrão "openai")
 */
export function createLlmClient(apiKey, provider = "openai") {
    const hasApiKey = Boolean(apiKey);

    async function generateWorkflowDraft(description) {
        const config = PROVIDER_ENDPOINTS[provider];
        if (!config) {
            throw new Error(`Provider de LLM desconhecido: "${provider}". Suportados: ${Object.keys(PROVIDER_ENDPOINTS).join(", ")}`);
        }

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(config.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: config.defaultModel,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: description }
                    ],
                    temperature: 0.2
                }),
                signal: ctrl.signal
            });
        } finally {
            clearTimeout(t);
        }

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Provedor LLM respondeu com erro (${res.status}): ${text}`);
        }

        const payload = await res.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
            throw new Error("Provedor LLM não devolveu conteúdo utilizável.");
        }

        try {
            return JSON.parse(stripCodeFences(content));
        } catch {
            throw new Error("Provedor LLM não devolveu um JSON válido de workflow.");
        }
    }

    return { hasApiKey, generateWorkflowDraft };
}
