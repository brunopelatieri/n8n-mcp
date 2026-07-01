// test/fixtures/fake-llm.js
//
// Handler de rotas para o servidor HTTP fake que simula um provedor de LLM
// compatível com a API de chat completion da OpenAI, usado nos testes de
// generate_workflow_draft. NUNCA se chama a API real de nenhum provedor.

function safeParse(body) {
    try { return JSON.parse(body); } catch { return {}; }
}

export function llmFakeHandler(record) {
    const url = new URL(record.url, "http://fake-llm.local");
    if (url.pathname === "/v1/chat/completions" && record.method === "POST") {
        const auth = record.headers["authorization"] ?? "";
        if (!auth.startsWith("Bearer ")) return { status: 401, text: "missing bearer token" };

        const parsed  = safeParse(record.body);
        const userMsg = parsed.messages?.find((m) => m.role === "user")?.content ?? "";

        if (userMsg.includes("trigger-llm-error")) {
            return { status: 500, text: "erro interno do provedor de LLM (simulado)" };
        }
        if (userMsg.includes("trigger-invalid-json")) {
            return { json: { choices: [{ message: { content: "isto não é um JSON válido" } }] } };
        }

        return {
            json: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            name: `Draft: ${userMsg}`,
                            nodes: [{ name: "Start", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [0, 0], parameters: {} }],
                            connections: {}
                        })
                    }
                }]
            }
        };
    }
    return { status: 404, text: `fake llm: rota não mapeada ${record.method} ${url.pathname}` };
}
