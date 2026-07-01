// test/fixtures/fake-templates.js
//
// Dados e handler de rotas para o servidor HTTP fake que simula a API pública
// de templates do n8n.io (https://api.n8n.io/api/templates) nos testes de
// search_templates/get_template/deploy_template. NUNCA se chama a API real.

export const TEMPLATE_SEARCH_RESULT = {
    totalWorkflows: 2,
    workflows: [
        {
            id: 1001, name: "Slack Notifier", description: "Envia mensagens ao Slack",
            totalViews: 500, nodes: [{ name: "n8n-nodes-base.webhook" }, { name: "n8n-nodes-base.slack" }]
        },
        {
            id: 1002, name: "Two", description: "Segundo template",
            totalViews: 10, nodes: []
        }
    ]
};

export const TEMPLATE_DETAIL = {
    "1001": {
        id: 1001,
        name: "Slack Notifier",
        description: "Envia mensagens ao Slack",
        workflow: {
            nodes: [
                {
                    id: "tpl-node-a", name: "Webhook", type: "n8n-nodes-base.webhook",
                    typeVersion: 1, position: [0, 0], parameters: {}, webhookId: "wh-tpl-123"
                },
                {
                    id: "tpl-node-b", name: "Slack", type: "n8n-nodes-base.slack",
                    typeVersion: 1, position: [200, 0], parameters: {},
                    credentials: { slackApi: { id: "cred1", name: "My Slack" } }
                }
            ],
            connections: { Webhook: { main: [[{ node: "Slack", type: "main", index: 0 }]] } },
            settings: { saveManualExecutions: true }
        }
    }
};

export function templatesFakeHandler(record) {
    const url = new URL(record.url, "http://fake-templates.local");
    const pathname = url.pathname;

    if (pathname === "/api/templates/search") {
        return { json: TEMPLATE_SEARCH_RESULT };
    }

    const m = pathname.match(/^\/api\/templates\/workflows\/([^/]+)$/);
    if (m) {
        const id = m[1];
        if (id === "404") return { status: 404, text: "template not found" };
        const detail = TEMPLATE_DETAIL[id];
        if (!detail) return { status: 404, text: `template ${id} not found` };
        return { json: detail };
    }

    return { status: 404, text: `fake templates: rota não mapeada ${record.method} ${pathname}` };
}
