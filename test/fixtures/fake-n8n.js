// test/fixtures/fake-n8n.js
//
// Dados e handler de rotas para o servidor HTTP fake que simula a API REST
// do n8n (api/v1/*) nos testes de tools.test.js.

export const WORKFLOWS_LIST = [
    { id: "1", name: "Workflow One", active: true },
    { id: "2", name: "Test Two", active: false },
    { id: "3", name: "Another One", active: true }
];

// Segunda "página" de list_workflows: o fixture sempre devolve nextCursor
// na primeira página (ver n8nFakeHandler), para exercitar a paginação real
// de list_workflows e a travessia de páginas de search_workflows mesmo nos
// testes que não pedem paginação explicitamente.
export const WORKFLOWS_LIST_PAGE_2 = [
    { id: "4", name: "Page Two Workflow", active: false }
];

export const WORKFLOW_DETAIL = {
    "1": {
        id: "1",
        name: "Workflow One",
        active: true,
        nodes: [
            {
                id: "node-a", name: "Webhook", type: "n8n-nodes-base.webhook",
                typeVersion: 1, position: [0, 0], parameters: {}, webhookId: "wh-abc-123"
            },
            {
                id: "node-b", name: "Set", type: "n8n-nodes-base.set",
                typeVersion: 1, position: [200, 0], parameters: {}
            }
        ],
        connections: { Webhook: { main: [[{ node: "Set", type: "main", index: 0 }]] } },
        settings: { saveManualExecutions: true }
    },
    // Simula uma instância n8n antiga: PUT /workflows/legacy responde 405,
    // exigindo o fallback para PATCH (SPEC 5.1 — update_workflow).
    "legacy": {
        id: "legacy",
        name: "Workflow Legado",
        active: false,
        nodes: [],
        connections: {},
        settings: {}
    }
};

export const EXECUTIONS_LIST = [
    { id: "e1", status: "success", startedAt: "2026-06-01T10:00:00.000Z" },
    { id: "e2", status: "error", startedAt: "2026-06-01T11:00:00.000Z" }
];

/**
 * Handler de rotas para startFakeServer (ver test/helpers/fake-http.js).
 * Simula api/v1/workflows, api/v1/executions e dois endpoints de webhook.
 */
export function n8nFakeHandler(record) {
    const url = new URL(record.url, "http://fake-n8n.local");
    const pathname = url.pathname;
    const method = record.method;

    // Webhook targets usados por execute_workflow_via_webhook (fora do prefixo /api/v1)
    if (pathname === "/webhook-test/success") {
        return { status: 200, json: { received: true, echo: safeParse(record.body) } };
    }
    if (pathname === "/webhook-test/fail") {
        return { status: 500, text: "webhook falhou internamente" };
    }

    // /healthz fica fora de /api/v1 (usado por health_check)
    if (pathname === "/healthz" && method === "GET") {
        return { json: { status: "ok", version: "1.50.0" } };
    }

    if (pathname === "/api/v1/workflows" && method === "GET") {
        const cursor = url.searchParams.get("cursor");
        if (cursor === "cursor-2") {
            return { json: { data: WORKFLOWS_LIST_PAGE_2 } }; // última página, sem nextCursor
        }
        return { json: { data: WORKFLOWS_LIST, nextCursor: "cursor-2" } };
    }
    if (pathname === "/api/v1/workflows" && method === "POST") {
        const parsed = safeParse(record.body);
        return { json: { id: "999", name: parsed.name, nodes: parsed.nodes, connections: parsed.connections, settings: parsed.settings, active: false } };
    }

    const activationMatch = pathname.match(/^\/api\/v1\/workflows\/([^/]+)\/(activate|deactivate)$/);
    if (activationMatch && method === "POST") {
        return { json: {} };
    }

    const wfMatch = pathname.match(/^\/api\/v1\/workflows\/([^/]+)$/);
    if (wfMatch) {
        const id = wfMatch[1];
        if (method === "GET") {
            if (id === "404") return { status: 404, text: "workflow not found" };
            const detail = WORKFLOW_DETAIL[id];
            if (!detail) return { status: 404, text: `workflow ${id} not found` };
            return { json: detail };
        }
        if (method === "PUT") {
            if (id === "legacy") return { status: 405, text: "Method Not Allowed: use PATCH" };
            const parsed = safeParse(record.body);
            return { json: { id, name: parsed.name, nodes: parsed.nodes, connections: parsed.connections, settings: parsed.settings } };
        }
        if (method === "PATCH") {
            const parsed = safeParse(record.body);
            return { json: { id, name: parsed.name, nodes: parsed.nodes, connections: parsed.connections, settings: parsed.settings } };
        }
        if (method === "DELETE") {
            if (id === "404") return { status: 404, text: "workflow not found" };
            return { json: {} };
        }
    }

    if (pathname === "/api/v1/executions" && method === "GET") {
        return { json: { data: EXECUTIONS_LIST } };
    }
    const execMatch = pathname.match(/^\/api\/v1\/executions\/([^/]+)$/);
    if (execMatch && method === "DELETE") {
        if (execMatch[1] === "404") return { status: 404, text: "execution not found" };
        return { json: {} };
    }

    // Tags CRUD (manage_tags)
    if (pathname === "/api/v1/tags" && method === "GET") {
        return { json: { data: [{ id: "t1", name: "prod" }] } };
    }
    if (pathname === "/api/v1/tags" && method === "POST") {
        const parsed = safeParse(record.body);
        return { json: { id: "t-new", name: parsed.name } };
    }
    const tagMatch = pathname.match(/^\/api\/v1\/tags\/([^/]+)$/);
    if (tagMatch) {
        const id = tagMatch[1];
        if (method === "PATCH") {
            const parsed = safeParse(record.body);
            return { json: { id, name: parsed.name } };
        }
        if (method === "DELETE") return { json: {} };
    }
    const tagsAssignMatch = pathname.match(/^\/api\/v1\/workflows\/([^/]+)\/tags$/);
    if (tagsAssignMatch && method === "PUT") {
        const parsed = safeParse(record.body);
        return { json: { workflowId: tagsAssignMatch[1], tags: parsed } };
    }

    // Variables CRUD (manage_variables) — id "missing" simula 404 (instância sem API de variáveis)
    if (pathname === "/api/v1/variables" && method === "GET") {
        return { json: { data: [{ id: "v1", key: "FOO", value: "bar" }] } };
    }
    if (pathname === "/api/v1/variables" && method === "POST") {
        const parsed = safeParse(record.body);
        return { json: { id: "v-new", key: parsed.key, value: parsed.value } };
    }
    const varMatch = pathname.match(/^\/api\/v1\/variables\/([^/]+)$/);
    if (varMatch) {
        const id = varMatch[1];
        if (id === "missing") return { status: 404, text: "variable not found" };
        if (method === "PATCH") {
            const parsed = safeParse(record.body);
            return { json: { id, key: parsed.key, value: parsed.value } };
        }
        if (method === "DELETE") return { json: {} };
    }

    // Credenciais (manage_credentials) — name "trigger-error" simula uma instância
    // que ecoa o corpo cru da requisição (incluindo `data`) numa mensagem de erro
    // de validação, para exercitar a redação central de n8n-client.js.
    const credSchemaMatch = pathname.match(/^\/api\/v1\/credentials\/schema\/([^/]+)$/);
    if (credSchemaMatch && method === "GET") {
        return { json: { type: credSchemaMatch[1], properties: { user: { type: "string" }, password: { type: "string" } } } };
    }
    if (pathname === "/api/v1/credentials" && method === "GET") {
        return { json: { data: [{ id: "c1", name: "Minha API", type: "httpBasicAuth" }] } };
    }
    if (pathname === "/api/v1/credentials" && method === "POST") {
        if (record.body.includes('"trigger-error"')) {
            return { status: 400, text: `Erro de validação: payload inválido: ${record.body}` };
        }
        const parsed = safeParse(record.body);
        return { json: { id: "c-new", name: parsed.name, type: parsed.type } };
    }
    const credMatch = pathname.match(/^\/api\/v1\/credentials\/([^/]+)$/);
    if (credMatch) {
        const id = credMatch[1];
        if (method === "GET") {
            if (id === "404") return { status: 404, text: "credential not found" };
            return { json: { id, name: "Minha API", type: "httpBasicAuth" } };
        }
        if (method === "PATCH") {
            const parsed = safeParse(record.body);
            return { json: { id, name: parsed.name ?? "Minha API", type: parsed.type ?? "httpBasicAuth" } };
        }
        if (method === "DELETE") return { json: {} };
    }

    // Auditoria (audit_instance)
    if (pathname === "/api/v1/audit" && method === "POST") {
        const parsed = safeParse(record.body);
        return { json: { receivedOptions: parsed.additionalOptions ?? {}, risks: [] } };
    }

    return { status: 404, text: `fake n8n: rota não mapeada ${method} ${pathname}` };
}

function safeParse(body) {
    try { return JSON.parse(body); } catch { return {}; }
}
