// src/templates-client.js
//
// Wrapper fino para a API pública de templates do n8n.io (sem autenticação,
// sem cache/banco local). Host fixo no código — não vem de input do cliente,
// por isso não passa pelo src/ssrf-guard.js (reservado a hosts informados por
// quem chama a tool, ex.: X-N8N-URL e URLs de webhook).

import fetch from "node-fetch";

// Host fixo no código — nunca vem de input do cliente MCP (headers/args), então
// esta chamada não passa pelo ssrf-guard. A env var só existe para os testes
// apontarem para um servidor fake local (nunca é lida de request do cliente).
const TEMPLATES_API_BASE = process.env.N8N_TEMPLATES_API_BASE ?? "https://api.n8n.io/api/templates";
const REQUEST_TIMEOUT_MS = 10000;

async function request(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(`${TEMPLATES_API_BASE}${path}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) {
            const text = await res.text();
            const error = new Error(`n8n.io templates error (${res.status}): ${text}`);
            error.status = res.status;
            throw error;
        }
        return res.json();
    } catch (e) {
        clearTimeout(t);
        throw e;
    }
}

export function createTemplatesClient() {
    return {
        // GET .../templates/search?page=&rows=&search=
        search: ({ search, limit, cursor } = {}) => {
            const usp = new URLSearchParams();
            if (search) usp.set("search", search);
            if (limit) usp.set("rows", String(limit));
            if (cursor) usp.set("page", String(cursor));
            const qs = usp.toString();
            return request(`/search${qs ? `?${qs}` : ""}`);
        },

        // GET .../templates/workflows/{templateId}
        getById: (templateId) => request(`/workflows/${templateId}`)
    };
}
