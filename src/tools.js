// src/tools.js
//
// Definições (name/description/inputSchema) das 10 tools atuais.
// Extraído do antigo getToolDefinitions() do index.js — conteúdo 1:1.

export function getToolDefinitions() {
    return [
        {
            name: "list_workflows",
            description: "Lista workflows do n8n, com paginação e filtros opcionais",
            inputSchema: {
                type: "object",
                properties: {
                    limit:  { type: "number",  description: "Máximo de resultados por página (opcional, padrão da API do n8n)" },
                    cursor: { type: "string",  description: "Cursor de paginação retornado em nextCursor (opcional)" },
                    active: { type: "boolean", description: "Filtra por workflows ativos/inativos (opcional)" },
                    tags:   { type: "array",   description: "Filtra por tags (opcional)", items: { type: "string" } }
                },
                required: []
            }
        },
        {
            name: "search_workflows",
            description: "Busca workflows pelo nome (percorre todas as páginas)",
            inputSchema: { type: "object", properties: { name: { type: "string", description: "Texto a buscar" } }, required: ["name"] }
        },
        {
            name: "get_workflow",
            description: "Retorna detalhes de um workflow pelo ID",
            inputSchema: {
                type: "object",
                properties: {
                    id:        { type: "string", description: "ID do workflow" },
                    mode:      { type: "string", description: "full (padrão) | structure | minimal | filtered", enum: ["full", "structure", "minimal", "filtered"] },
                    nodeNames: { type: "array",  description: "Nomes de nodes a incluir quando mode=filtered", items: { type: "string" } }
                },
                required: ["id"]
            }
        },
        {
            name: "create_workflow",
            description: "Cria um novo workflow no n8n",
            inputSchema: {
                type: "object",
                properties: {
                    name:        { type: "string", description: "Nome do workflow" },
                    nodes:       { type: "array",  description: "Array de nós", items: { type: "object" } },
                    connections: { type: "object", description: "Conexões entre nós" }
                },
                required: ["name"]
            }
        },
        {
            name: "update_workflow",
            description: "Atualiza um workflow existente",
            inputSchema: {
                type: "object",
                properties: {
                    id:          { type: "string", description: "ID do workflow" },
                    name:        { type: "string", description: "Novo nome (opcional)" },
                    nodes:       { type: "array",  description: "Nós (opcional)", items: { type: "object" } },
                    connections: { type: "object", description: "Conexões (opcional)" }
                },
                required: ["id"]
            }
        },
        {
            name: "activate_workflow",
            description: "Ativa ou desativa um workflow",
            inputSchema: {
                type: "object",
                properties: {
                    id:     { type: "string",  description: "ID do workflow" },
                    active: { type: "boolean", description: "true para ativar, false para desativar" }
                },
                required: ["id", "active"]
            }
        },
        {
            name: "delete_workflow",
            description: "Remove um workflow permanentemente",
            inputSchema: { type: "object", properties: { id: { type: "string", description: "ID do workflow" } }, required: ["id"] }
        },
        {
            name: "get_executions",
            description: "Lista execuções recentes de um workflow",
            inputSchema: {
                type: "object",
                properties: {
                    workflowId: { type: "string", description: "ID do workflow" },
                    limit:      { type: "number", description: "Limite de resultados (padrão 10)" },
                    cursor:     { type: "string", description: "Cursor de paginação retornado em nextCursor (opcional)" },
                    status:     { type: "string", description: "Filtra por status (success | error | waiting) (opcional)", enum: ["success", "error", "waiting"] },
                    mode:       { type: "string", description: "full (padrão, dump completo) | preview (só id/status/startedAt)", enum: ["full", "preview"] }
                },
                required: ["workflowId"]
            }
        },
        {
            name: "execute_workflow_via_webhook",
            description: "Executa um workflow via webhook",
            inputSchema: {
                type: "object",
                properties: {
                    webhookUrl: { type: "string", description: "URL do webhook" },
                    payload:    { type: "object", description: "Body a enviar (opcional)" },
                    httpMethod: { type: "string", description: "Método HTTP (padrão POST)", enum: ["GET", "POST", "PUT", "DELETE"] },
                    headers:    { type: "object", description: "Headers customizados a enviar (opcional)" }
                },
                required: ["webhookUrl"]
            }
        },
        {
            name: "get_workflow_as_template",
            description: "Exporta workflow como template reutilizável",
            inputSchema: { type: "object", properties: { id: { type: "string", description: "ID do workflow" } }, required: ["id"] }
        },
        {
            name: "delete_execution",
            description: "Remove uma execução pelo ID",
            inputSchema: { type: "object", properties: { id: { type: "string", description: "ID da execução" } }, required: ["id"] }
        },
        {
            name: "health_check",
            description: "Verifica se a instância n8n está respondendo (tenta /healthz, com fallback para listagem de workflows)",
            inputSchema: { type: "object", properties: {}, required: [] }
        },
        {
            name: "manage_tags",
            description: "Gerencia tags do n8n (listar, criar, atualizar, remover, atribuir a um workflow)",
            inputSchema: {
                type: "object",
                properties: {
                    action:     { type: "string", description: "Ação a executar", enum: ["list", "create", "update", "delete", "assign"] },
                    id:         { type: "string", description: "ID da tag (create/update/delete)" },
                    name:       { type: "string", description: "Nome da tag (create/update)" },
                    workflowId: { type: "string", description: "ID do workflow (assign)" },
                    tagIds:     { type: "array",  description: "IDs das tags a atribuir ao workflow (assign)", items: { type: "string" } }
                },
                required: ["action"]
            }
        },
        {
            name: "manage_variables",
            description: "Gerencia variáveis de ambiente do n8n (listar, criar, atualizar, remover). Nem toda instância expõe essa API.",
            inputSchema: {
                type: "object",
                properties: {
                    action: { type: "string", description: "Ação a executar", enum: ["list", "create", "update", "delete"] },
                    id:     { type: "string", description: "ID da variável (update/delete)" },
                    key:    { type: "string", description: "Chave da variável (create/update)" },
                    value:  { type: "string", description: "Valor da variável (create/update)" }
                },
                required: ["action"]
            }
        },
        {
            name: "manage_credentials",
            description: "Gerencia credenciais do n8n (listar, obter, criar, atualizar, remover, obter schema de um tipo). O campo 'data' nunca é exposto em erros ou logs.",
            inputSchema: {
                type: "object",
                properties: {
                    action: { type: "string", description: "Ação a executar", enum: ["list", "get", "create", "update", "delete", "getSchema"] },
                    id:     { type: "string", description: "ID da credencial (get/update/delete)" },
                    name:   { type: "string", description: "Nome da credencial (create/update)" },
                    type:   { type: "string", description: "Tipo da credencial, ex.: httpBasicAuth (create/update/getSchema)" },
                    data:   { type: "object", description: "Valores sensíveis da credencial (create/update) — nunca é ecoado de volta" }
                },
                required: ["action"]
            }
        },
        {
            name: "search_templates",
            description: "Busca templates de workflow no n8n.io (live, sem cache/banco local)",
            inputSchema: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Texto a buscar (opcional)" },
                    limit:  { type: "number", description: "Máximo de resultados por página (rows, opcional)" },
                    cursor: { type: "string", description: "Página de resultados (page, opcional)" }
                },
                required: []
            }
        },
        {
            name: "get_template",
            description: "Retorna detalhes de um template do n8n.io pelo ID, para inspeção antes de importar",
            inputSchema: {
                type: "object",
                properties: { templateId: { type: "string", description: "ID do template no n8n.io" } },
                required: ["templateId"]
            }
        },
        {
            name: "deploy_template",
            description: "Importa um template do n8n.io como novo workflow (remove id/webhookId dos nodes e, por padrão, referências de credentials; sem auto-fix de typeVersion — workflow criado inativo)",
            inputSchema: {
                type: "object",
                properties: {
                    templateId:       { type: "string",  description: "ID do template no n8n.io" },
                    name:             { type: "string",  description: "Nome do novo workflow (opcional; padrão: nome do template)" },
                    stripCredentials: { type: "boolean", description: "Remove referências de credentials dos nodes (padrão true)" }
                },
                required: ["templateId"]
            }
        },
        {
            name: "generate_workflow_draft",
            description: "Gera uma PROPOSTA de workflow (nodes/connections) a partir de uma descrição em linguagem natural, via um provedor LLM externo. Opt-in: requer os headers X-LLM-API-KEY (obrigatório) e X-LLM-PROVIDER (opcional, padrão 'openai') na requisição MCP — nenhuma chave de LLM é armazenada no servidor. Não faz deploy automático; use create_workflow depois para efetivar a proposta.",
            inputSchema: {
                type: "object",
                properties: {
                    description: { type: "string", description: "Descrição em linguagem natural do workflow desejado" }
                },
                required: ["description"]
            }
        },
        {
            name: "update_workflow_partial",
            description: "Atualiza um workflow incrementalmente via operações de diff (GET → aplica em memória → PUT), sem reenviar nodes/connections inteiros. A lista é atômica: se qualquer operação for inválida, nada é enviado ao n8n. Operações: addNode, removeNode, updateNode, patchNodeField, moveNode, enableNode, disableNode, addConnection, removeConnection, updateSettings, updateName, activateWorkflow, deactivateWorkflow.",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "ID do workflow" },
                    operations: {
                        type: "array",
                        description: "Lista de operações a aplicar, em ordem. Cada item tem um campo 'type' e os campos específicos da operação.",
                        items: {
                            type: "object",
                            properties: {
                                type: {
                                    type: "string",
                                    enum: ["addNode", "removeNode", "updateNode", "patchNodeField", "moveNode", "enableNode", "disableNode", "addConnection", "removeConnection", "updateSettings", "updateName", "activateWorkflow", "deactivateWorkflow"],
                                    description: "Tipo da operação"
                                },
                                node:       { type: "object", description: "addNode: node a inserir ({ name, type, position, ... })" },
                                nodeId:     { type: "string", description: "Referência do node por id (removeNode/updateNode/patchNodeField/moveNode/enableNode/disableNode)" },
                                nodeName:   { type: "string", description: "Referência do node por nome (alternativa a nodeId)" },
                                updates:    { type: "object", description: "updateNode: mapa de dot-path -> valor (ex.: { 'parameters.url': 'https://...' })" },
                                fieldPath:  { type: "string", description: "patchNodeField: dot-path do campo string (ex.: 'parameters.jsCode')" },
                                patches:    { type: "array", description: "patchNodeField: [{ find, replace, replaceAll?, regex? }]", items: { type: "object" } },
                                position:   { type: "array", description: "moveNode: [x, y]", items: { type: "number" } },
                                source:     { type: "string", description: "addConnection/removeConnection: node de origem (nome ou id)" },
                                target:     { type: "string", description: "addConnection/removeConnection: node de destino (nome ou id)" },
                                sourceOutput: { type: "string", description: "addConnection/removeConnection: saída de origem (padrão 'main')" },
                                targetInput:  { type: "string", description: "addConnection/removeConnection: entrada de destino (padrão 'main')" },
                                sourceIndex:  { type: "number", description: "addConnection: índice da saída (padrão 0)" },
                                targetIndex:  { type: "number", description: "addConnection: índice da entrada (padrão 0)" },
                                ignoreErrors: { type: "boolean", description: "removeConnection: não falha se a conexão não existir" },
                                settings:   { type: "object", description: "updateSettings: campos a mesclar em settings" },
                                name:       { type: "string", description: "updateName: novo nome do workflow" }
                            },
                            required: ["type"]
                        }
                    }
                },
                required: ["id", "operations"]
            }
        },
        {
            name: "validate_node_config",
            description: "Validação leve e estática de um node (contra uma lista curada de ~30 node-types comuns). Devolve { known, errors, warnings } — nunca bloqueia, só orienta. Node-type fora da lista curada: known:false.",
            inputSchema: {
                type: "object",
                properties: {
                    nodeType:   { type: "string", description: "Tipo do node, ex.: n8n-nodes-base.httpRequest" },
                    parameters: { type: "object", description: "Objeto 'parameters' do node (opcional, padrão {})" }
                },
                required: ["nodeType"]
            }
        },
        {
            name: "audit_instance",
            description: "Gera um relatório de auditoria de segurança da instância n8n (passthrough de POST /audit)",
            inputSchema: {
                type: "object",
                properties: {
                    categories:            { type: "array",  description: "Categorias a auditar (opcional; padrão: todas)", items: { type: "string" } },
                    daysAbandonedWorkflow: { type: "number", description: "Dias sem execução para considerar um workflow abandonado (opcional)" }
                },
                required: []
            }
        }
    ];
}
