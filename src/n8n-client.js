// src/n8n-client.js
//
// Cliente HTTP para a API REST do n8n (api/v1/*). Expõe métodos organizados
// por recurso (workflows.*, executions.*). Centraliza: montagem de query
// string (paginação/filtros), fallback PUT->PATCH em 405, timeout, proteção
// SSRF (SPEC seção 7, item 1) e erros padronizados (N8nApiError — SPEC
// seção 7, item 2).
//
// SSRF: X-N8N-URL vem do cliente da requisição MCP, então o host é validado
// via src/ssrf-guard.js antes de QUALQUER chamada real (request/rawRequest),
// no modo resolvido de N8N_SSRF_MODE (default "moderate"). A validação roda
// uma única vez por client (mesma n8nUrl para todas as chamadas), não a cada
// request.

import fetch from "node-fetch";
import { assertSafeUrl } from "./ssrf-guard.js";

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Erro padronizado para falhas da API do n8n (SPEC seção 7, item 2).
 * Nunca inclui a API key na mensagem — ela só é enviada como header, nunca
 * ecoada de volta pelo n8n nem incluída na formatação abaixo.
 */
export class N8nApiError extends Error {
    constructor(message, status, code) {
        super(message);
        this.name   = "N8nApiError";
        this.status = status;
        this.code   = code;
    }
}

/** Deriva um código de erro estável a partir do status HTTP. */
function codeForStatus(status) {
    switch (status) {
        case 400: return "VALIDATION_ERROR";
        case 401: return "AUTHENTICATION_ERROR";
        case 404: return "NOT_FOUND";
        case 429: return "RATE_LIMIT_ERROR";
        default:  return status >= 500 ? "SERVER_ERROR" : "API_ERROR";
    }
}

/** Envolve falhas de rede/timeout/SSRF (fetch) num N8nApiError, sem alterar erros já padronizados. */
function wrapNetworkError(e) {
    if (e instanceof N8nApiError) return e;
    if (typeof e?.message === "string" && e.message.startsWith("SSRF guard")) {
        return new N8nApiError(e.message, undefined, "SSRF_BLOCKED");
    }
    const code = e?.name === "AbortError" ? "TIMEOUT_ERROR" : "REQUEST_ERROR";
    return new N8nApiError(`Falha ao conectar à instância n8n: ${e.message}`, undefined, code);
}

// Campos que NUNCA podem aparecer em mensagens de erro devolvidas ao cliente
// MCP, em console.log/console.error ou em stack traces (SPEC seção 7, item 3).
const SENSITIVE_FIELDS = ["data"];

/**
 * Substitui recursivamente o campo `data` por um marcador, mas só quando o
 * objeto "parece" uma credencial (tem `type` ao lado de `data`) — isso evita
 * confundir com o envelope de paginação `{ data: [...] }` usado por outros
 * recursos (tags, variáveis, workflows), que não é sensível.
 */
function redactSensitive(value) {
    if (Array.isArray(value)) return value.map(redactSensitive);
    if (value && typeof value === "object") {
        const looksLikeCredential = SENSITIVE_FIELDS.some((f) => f in value) && "type" in value;
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = (looksLikeCredential && SENSITIVE_FIELDS.includes(k)) ? "[REDACTED]" : redactSensitive(v);
        }
        return out;
    }
    return value;
}

/**
 * Redige o corpo de uma resposta de erro da API do n8n antes que ela vire
 * mensagem de Error. Algumas instâncias ecoam o payload da requisição (que
 * pode incluir `data`) na própria mensagem de validação — se o texto não for
 * JSON parseável mas contiver o campo `data`, redige o texto inteiro em vez
 * de arriscar deixar o valor sensível escapar por um regex frágil.
 */
function redactErrorText(text) {
    if (typeof text !== "string" || !text) return text;
    try {
        return JSON.stringify(redactSensitive(JSON.parse(text)));
    } catch {
        return /"data"\s*:/.test(text)
            ? "[resposta da API do n8n redigida: continha o campo sensível 'data']"
            : text;
    }
}

/**
 * Monta uma query string a partir de um objeto de parâmetros, ignorando
 * valores undefined/null/"" e juntando arrays com vírgula (ex.: tags).
 */
function buildQuery(params = {}) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        if (Array.isArray(value)) {
            if (value.length) usp.set(key, value.join(","));
        } else {
            usp.set(key, String(value));
        }
    }
    const qs = usp.toString();
    return qs ? `?${qs}` : "";
}

/**
 * Cria um cliente n8n vinculado a uma URL base e API key (por requisição).
 *
 * @param {string} n8nUrl     URL base da instância n8n (ex.: https://n8n.exemplo.com)
 * @param {string} n8nApiKey  API key do n8n (header X-N8N-API-KEY)
 * @returns {object} client com `request` cru + namespaces por recurso
 */
export function createN8nClient(n8nUrl, n8nApiKey) {
    // Validação SSRF do host de n8nUrl: dispara uma única vez (não a cada
    // chamada) e nunca gera unhandled rejection — o resultado (erro ou nada)
    // só é observado quando alguma chamada real é feita (ensureSafeUrl abaixo).
    const safeUrlCheck = assertSafeUrl(n8nUrl).catch((e) => e);
    async function ensureSafeUrl() {
        const result = await safeUrlCheck;
        if (result instanceof Error) throw result;
    }

    async function request(path, method = "GET", body, { redactErrors = false } = {}) {
        const base = n8nUrl.endsWith("/") ? n8nUrl : `${n8nUrl}/`;
        const url  = `${base}api/v1/${path.replace(/^\//, "")}`;
        const ctrl = new AbortController();
        const t    = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        try {
            await ensureSafeUrl();
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
                body: body ? JSON.stringify(body) : undefined,
                signal: ctrl.signal
            });
            clearTimeout(t);
            if (!res.ok) {
                const text = await res.text();
                throw new N8nApiError(`n8n error (${res.status}): ${redactErrors ? redactErrorText(text) : text}`, res.status, codeForStatus(res.status));
            }
            return res.json();
        } catch (e) {
            clearTimeout(t);
            throw wrapNetworkError(e);
        }
    }

    // Requisição "crua" contra a raiz da instância (sem prefixo /api/v1/) —
    // usada por endpoints como /healthz, que ficam fora da API REST versionada.
    async function rawRequest(path, method = "GET") {
        const base = n8nUrl.endsWith("/") ? n8nUrl : `${n8nUrl}/`;
        const url  = `${base}${path.replace(/^\//, "")}`;
        const ctrl = new AbortController();
        const t    = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        try {
            await ensureSafeUrl();
            const res = await fetch(url, { method, headers: { "X-N8N-API-KEY": n8nApiKey }, signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) {
                const text = await res.text();
                throw new N8nApiError(`n8n error (${res.status}): ${text}`, res.status, codeForStatus(res.status));
            }
            return res.json().catch(() => ({}));
        } catch (e) {
            clearTimeout(t);
            throw wrapNetworkError(e);
        }
    }

    const workflows = {
        list: (params = {}) => request(`/workflows${buildQuery(params)}`),
        get:  (id)          => request(`/workflows/${id}`),
        create: (body)      => request("/workflows", "POST", body),

        // Fallback PUT->PATCH: instâncias n8n mais antigas podem não suportar
        // PUT em /workflows/{id} e respondem 405 (Method Not Allowed).
        update: async (id, body) => {
            try {
                return await request(`/workflows/${id}`, "PUT", body);
            } catch (e) {
                if (e.status === 405) return request(`/workflows/${id}`, "PATCH", body);
                throw e;
            }
        },

        delete:     (id) => request(`/workflows/${id}`, "DELETE"),
        activate:   (id) => request(`/workflows/${id}/activate`, "POST"),
        deactivate: (id) => request(`/workflows/${id}/deactivate`, "POST")
    };

    const executions = {
        list: ({ workflowId, limit, cursor, status } = {}) =>
            request(`/executions${buildQuery({ workflowId, limit, cursor, status })}`),
        delete: (id) => request(`/executions/${id}`, "DELETE")
    };

    // health_check: tenta /healthz (fora de /api/v1); se indisponível, cai
    // para GET /workflows?limit=1 como sinal indireto de que a API responde.
    const health = {
        check: async () => {
            try {
                const data = await rawRequest("healthz");
                return { n8nVersion: data?.version };
            } catch {
                await workflows.list({ limit: 1 });
                return {};
            }
        }
    };

    const tags = {
        list:   ()               => request("/tags"),
        create: (name)           => request("/tags", "POST", { name }),
        update: (id, name)       => request(`/tags/${id}`, "PATCH", { name }),
        delete: (id)             => request(`/tags/${id}`, "DELETE"),
        assign: (workflowId, tagIds = []) => request(`/workflows/${workflowId}/tags`, "PUT", tagIds.map((id) => ({ id })))
    };

    const variables = {
        list:   ()                     => request("/variables"),
        create: (key, value)           => request("/variables", "POST", { key, value }),
        update: (id, key, value)       => request(`/variables/${id}`, "PATCH", { key, value }),
        delete: (id)                   => request(`/variables/${id}`, "DELETE")
    };

    const audit = {
        generate: (additionalOptions = {}) => request("/audit", "POST", { additionalOptions })
    };

    // Credenciais: todas as chamadas passam redactErrors:true — nenhuma mensagem
    // de erro propagada por esta API pode conter o campo `data` (SPEC seção 7.3).
    const credentials = {
        list:      ()             => request("/credentials", "GET", undefined, { redactErrors: true }),
        get:       (id)           => request(`/credentials/${id}`, "GET", undefined, { redactErrors: true }),
        create:    (body)         => request("/credentials", "POST", body, { redactErrors: true }),
        update:    (id, body)     => request(`/credentials/${id}`, "PATCH", body, { redactErrors: true }),
        delete:    (id)           => request(`/credentials/${id}`, "DELETE", undefined, { redactErrors: true }),
        getSchema: (type)         => request(`/credentials/schema/${type}`, "GET", undefined, { redactErrors: true })
    };

    return { request, workflows, executions, health, tags, variables, audit, credentials };
}

export { redactSensitive };
