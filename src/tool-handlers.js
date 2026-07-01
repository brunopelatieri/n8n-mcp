// src/tool-handlers.js
//
// Dispatcher executeTool(name, args, n8nClient). Aplica as otimizações da
// SPEC seção 5.1 mantendo os nomes das tools e o comportamento default
// (sem os novos parâmetros opcionais) idêntico ao original.

import fetch from "node-fetch";
import { randomUUID } from "node:crypto";
import { assertSafeUrl } from "./ssrf-guard.js";
import { redactSensitive } from "./n8n-client.js";
import { applyWorkflowDiff } from "./workflow-diff.js";
import { validateNodeConfig } from "./node-validator.js";

const WEBHOOK_TIMEOUT_MS = 15000;
const REQUIRED_NODE_FIELDS = ["id", "name", "type", "typeVersion", "position", "parameters"];

/** Valida a forma mínima de cada node antes de criar/atualizar um workflow. */
function validateNodesShape(nodes) {
    (nodes ?? []).forEach((node, i) => {
        const missing = REQUIRED_NODE_FIELDS.filter((f) => node?.[f] === undefined);
        if (missing.length) {
            const label = node?.name ? `"${node.name}"` : `índice ${i}`;
            throw new Error(`Node inválido (${label}): campo(s) obrigatório(s) ausente(s): ${missing.join(", ")}`);
        }
    });
}

/**
 * Roda validate_node_config em cada node (best-effort, nunca bloqueia).
 * Devolve só as entradas com errors/warnings — array vazio se tudo limpo
 * ou se nenhum node estiver na lista curada.
 */
function collectNodeValidationWarnings(nodes) {
    const out = [];
    for (const node of nodes ?? []) {
        const { known, errors, warnings } = validateNodeConfig(node?.type, node?.parameters ?? {});
        if (known && (errors.length || warnings.length)) {
            out.push({ node: node?.name ?? node?.id ?? "?", type: node?.type, errors, warnings });
        }
    }
    return out;
}

/** Valida o shape dos nodes e cria o workflow — reusado por create_workflow e deploy_template. */
async function createWorkflowInternal(n8nClient, { name, nodes, connections }) {
    validateNodesShape(nodes);
    return n8nClient.workflows.create({ name, nodes, connections, settings: {} });
}

/** Busca um template do n8n.io e normaliza para { id, name, description, workflow: { nodes, connections, settings } }. */
async function fetchTemplate(templatesClient, templateId) {
    const raw = await templatesClient.getById(templateId);
    const wf  = raw?.workflow ?? {};
    return {
        id: raw?.id,
        name: raw?.name,
        description: raw?.description,
        workflow: { nodes: wf.nodes ?? [], connections: wf.connections ?? {}, settings: wf.settings ?? {} }
    };
}

/** Busca todas as páginas de workflows (segue nextCursor) e devolve um array único. */
async function listAllWorkflows(n8nClient, filters = {}) {
    const all = [];
    let cursor;
    do {
        const data = await n8nClient.workflows.list({ ...filters, cursor });
        const list = data?.data ?? data;
        if (Array.isArray(list)) all.push(...list);
        cursor = data?.nextCursor;
    } while (cursor);
    return all;
}

export async function executeTool(name, args, n8nClient, templatesClient, llmClient) {
    const ok  = (texts) => ({ content: Array.isArray(texts) ? texts.map((t) => ({ type: "text", text: t })) : [{ type: "text", text: texts }] });
    const err = (msg)   => ({ content: [{ type: "text", text: `Erro: ${msg}` }], isError: true });

    try {
        switch (name) {
            case "list_workflows": {
                const { limit, cursor, active, tags } = args;
                const data = await n8nClient.workflows.list({ limit, cursor, active, tags });
                const list = data?.data ?? data;
                return ok([`${Array.isArray(list) ? list.length : "?"} workflow(s) encontrado(s).`, JSON.stringify(data, null, 2)]);
            }
            case "search_workflows": {
                const all  = await listAllWorkflows(n8nClient);
                const list = all.filter((w) => w.name?.toLowerCase().includes((args.name ?? "").toLowerCase()));
                return ok([`${list.length} encontrado(s) com "${args.name}".`, JSON.stringify(list.map((w) => ({ id: w.id, name: w.name, active: w.active })), null, 2)]);
            }
            case "get_workflow": {
                const mode = args.mode ?? "full";
                const data = await n8nClient.workflows.get(args.id);
                const summary = `Workflow: "${data.name}" (ativo: ${data.active})`;

                if (mode === "minimal") {
                    const minimal = { id: data.id, name: data.name, active: data.active, nodeCount: data.nodes?.length ?? 0, tags: data.tags ?? [] };
                    return ok([summary, JSON.stringify(minimal, null, 2)]);
                }
                if (mode === "structure") {
                    const structure = {
                        id: data.id, name: data.name, active: data.active,
                        nodes: (data.nodes ?? []).map((n) => ({ id: n.id, name: n.name, type: n.type, typeVersion: n.typeVersion, position: n.position })),
                        connections: data.connections
                    };
                    return ok([summary, JSON.stringify(structure, null, 2)]);
                }
                if (mode === "filtered") {
                    const names = new Set(args.nodeNames ?? []);
                    const filtered = { ...data, nodes: (data.nodes ?? []).filter((n) => names.has(n.name)) };
                    return ok([summary, JSON.stringify(filtered, null, 2)]);
                }
                // mode === "full" (default, comportamento original)
                return ok([summary, JSON.stringify(data, null, 2)]);
            }
            case "create_workflow": {
                const nodes       = args.nodes       ?? [];
                const connections = args.connections ?? {};
                const data = await createWorkflowInternal(n8nClient, { name: args.name, nodes, connections });
                const nodeValidationWarnings = collectNodeValidationWarnings(nodes);
                const payload = { id: data.id, name: data.name, ...(nodeValidationWarnings.length ? { nodeValidationWarnings } : {}) };
                return ok(["Workflow criado.", JSON.stringify(payload, null, 2)]);
            }
            case "update_workflow": {
                const ex = await n8nClient.workflows.get(args.id);
                const body = {
                    name:        args.name        ?? ex.name,
                    nodes:       args.nodes       ?? ex.nodes,
                    connections: args.connections ?? ex.connections,
                    settings:    ex.settings      ?? {}
                };
                const up = await n8nClient.workflows.update(args.id, body);
                const nodeValidationWarnings = collectNodeValidationWarnings(body.nodes);
                const payload = { id: up.id, name: up.name, ...(nodeValidationWarnings.length ? { nodeValidationWarnings } : {}) };
                return ok(["Workflow atualizado.", JSON.stringify(payload, null, 2)]);
            }
            case "activate_workflow": {
                if (args.active) await n8nClient.workflows.activate(args.id);
                else             await n8nClient.workflows.deactivate(args.id);
                return ok(`Workflow ${args.id} ${args.active ? "ativado" : "desativado"}.`);
            }
            case "delete_workflow": {
                await n8nClient.workflows.delete(args.id);
                return ok(`Workflow ${args.id} removido.`);
            }
            case "get_executions": {
                const { workflowId, limit = 10, cursor, status } = args;
                const mode = args.mode ?? "full";
                const data = await n8nClient.executions.list({ workflowId, limit, cursor, status });
                const list = data?.data ?? data;
                const count = list?.length ?? "?";

                if (mode === "preview") {
                    const preview = (Array.isArray(list) ? list : []).map((e) => ({ id: e.id, status: e.status, startedAt: e.startedAt }));
                    const out = { data: preview, ...(data?.nextCursor !== undefined ? { nextCursor: data.nextCursor } : {}) };
                    return ok([`${count} execução(ões).`, JSON.stringify(out, null, 2)]);
                }
                return ok([`${count} execução(ões).`, JSON.stringify(data, null, 2)]);
            }
            case "execute_workflow_via_webhook": {
                await assertSafeUrl(args.webhookUrl);

                const httpMethod = (args.httpMethod ?? "POST").toUpperCase();
                const hasBody    = httpMethod !== "GET";

                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);
                const res = await fetch(args.webhookUrl, {
                    method: httpMethod,
                    headers: { "Content-Type": "application/json", ...(args.headers ?? {}) },
                    body: hasBody ? JSON.stringify(args.payload ?? {}) : undefined,
                    signal: ctrl.signal
                });
                clearTimeout(t);
                const text = await res.text();
                let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
                if (!res.ok) return err(`Webhook erro (${res.status}): ${text}`);
                return ok([`Webhook OK (${res.status}).`, typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)]);
            }
            case "get_workflow_as_template": {
                const data = await n8nClient.workflows.get(args.id);
                const tpl = {
                    name: `${data.name} (cópia)`,
                    nodes: data.nodes.map((n) => { const c = { ...n }; delete c.id; delete c.webhookId; return c; }),
                    connections: data.connections,
                    settings: data.settings ?? {}
                };
                return ok([`Template de "${data.name}". Use com create_workflow.`, JSON.stringify(tpl, null, 2)]);
            }
            case "delete_execution": {
                await n8nClient.executions.delete(args.id);
                return ok(`Execução ${args.id} removida.`);
            }
            case "health_check": {
                const start = Date.now();
                try {
                    const info = await n8nClient.health.check();
                    return ok(JSON.stringify({ ok: true, ...info, latencyMs: Date.now() - start }, null, 2));
                } catch (e) {
                    // health_check nunca é isError: o objetivo é reportar o estado do n8n,
                    // não falhar a chamada da tool em si.
                    return ok(JSON.stringify({ ok: false, error: e.message, latencyMs: Date.now() - start }, null, 2));
                }
            }
            case "manage_tags": {
                switch (args.action) {
                    case "list": {
                        const data = await n8nClient.tags.list();
                        return ok(JSON.stringify(data, null, 2));
                    }
                    case "create": {
                        if (!args.name) return err("manage_tags(create): campo 'name' é obrigatório");
                        const data = await n8nClient.tags.create(args.name);
                        return ok(["Tag criada.", JSON.stringify(data, null, 2)]);
                    }
                    case "update": {
                        if (!args.id || !args.name) return err("manage_tags(update): campos 'id' e 'name' são obrigatórios");
                        const data = await n8nClient.tags.update(args.id, args.name);
                        return ok(["Tag atualizada.", JSON.stringify(data, null, 2)]);
                    }
                    case "delete": {
                        if (!args.id) return err("manage_tags(delete): campo 'id' é obrigatório");
                        await n8nClient.tags.delete(args.id);
                        return ok(`Tag ${args.id} removida.`);
                    }
                    case "assign": {
                        if (!args.workflowId) return err("manage_tags(assign): campo 'workflowId' é obrigatório");
                        const data = await n8nClient.tags.assign(args.workflowId, args.tagIds ?? []);
                        return ok(["Tags atribuídas ao workflow.", JSON.stringify(data, null, 2)]);
                    }
                    default:
                        return err(`manage_tags: action desconhecida: ${args.action}`);
                }
            }
            case "manage_variables": {
                try {
                    switch (args.action) {
                        case "list": {
                            const data = await n8nClient.variables.list();
                            return ok(JSON.stringify(data, null, 2));
                        }
                        case "create": {
                            if (!args.key) return err("manage_variables(create): campo 'key' é obrigatório");
                            const data = await n8nClient.variables.create(args.key, args.value);
                            return ok(["Variável criada.", JSON.stringify(data, null, 2)]);
                        }
                        case "update": {
                            if (!args.id) return err("manage_variables(update): campo 'id' é obrigatório");
                            const data = await n8nClient.variables.update(args.id, args.key, args.value);
                            return ok(["Variável atualizada.", JSON.stringify(data, null, 2)]);
                        }
                        case "delete": {
                            if (!args.id) return err("manage_variables(delete): campo 'id' é obrigatório");
                            await n8nClient.variables.delete(args.id);
                            return ok(`Variável ${args.id} removida.`);
                        }
                        default:
                            return err(`manage_variables: action desconhecida: ${args.action}`);
                    }
                } catch (e) {
                    if (e.status === 404) {
                        return err(`API de variáveis indisponível ou recurso não encontrado nesta instância do n8n: ${e.message}`);
                    }
                    throw e;
                }
            }
            case "manage_credentials": {
                switch (args.action) {
                    case "list": {
                        const data = await n8nClient.credentials.list();
                        return ok(JSON.stringify(redactSensitive(data), null, 2));
                    }
                    case "get": {
                        if (!args.id) return err("manage_credentials(get): campo 'id' é obrigatório");
                        const data = await n8nClient.credentials.get(args.id);
                        return ok(JSON.stringify(redactSensitive(data), null, 2));
                    }
                    case "create": {
                        if (!args.name || !args.type) return err("manage_credentials(create): campos 'name' e 'type' são obrigatórios");
                        const data = await n8nClient.credentials.create({ name: args.name, type: args.type, data: args.data ?? {} });
                        return ok(["Credencial criada.", JSON.stringify(redactSensitive(data), null, 2)]);
                    }
                    case "update": {
                        if (!args.id) return err("manage_credentials(update): campo 'id' é obrigatório");
                        const body = {};
                        if (args.name !== undefined) body.name = args.name;
                        if (args.type !== undefined) body.type = args.type;
                        if (args.data !== undefined) body.data = args.data;
                        const data = await n8nClient.credentials.update(args.id, body);
                        return ok(["Credencial atualizada.", JSON.stringify(redactSensitive(data), null, 2)]);
                    }
                    case "delete": {
                        if (!args.id) return err("manage_credentials(delete): campo 'id' é obrigatório");
                        await n8nClient.credentials.delete(args.id);
                        return ok(`Credencial ${args.id} removida.`);
                    }
                    case "getSchema": {
                        if (!args.type) return err("manage_credentials(getSchema): campo 'type' é obrigatório");
                        const data = await n8nClient.credentials.getSchema(args.type);
                        return ok(JSON.stringify(data, null, 2));
                    }
                    default:
                        return err(`manage_credentials: action desconhecida: ${args.action}`);
                }
            }
            case "search_templates": {
                const raw = await templatesClient.search({ search: args.search, limit: args.limit, cursor: args.cursor });
                const list = (raw?.workflows ?? []).map((w) => ({
                    id: w.id,
                    name: w.name,
                    description: w.description,
                    totalViews: w.totalViews,
                    nodes: (w.nodes ?? []).map((n) => n?.name ?? n)
                }));
                return ok([`${list.length} template(s) encontrado(s).`, JSON.stringify(list, null, 2)]);
            }
            case "get_template": {
                if (!args.templateId) return err("get_template: campo 'templateId' é obrigatório");
                const tpl = await fetchTemplate(templatesClient, args.templateId);
                return ok([`Template: "${tpl.name}"`, JSON.stringify(tpl, null, 2)]);
            }
            case "deploy_template": {
                if (!args.templateId) return err("deploy_template: campo 'templateId' é obrigatório");
                const tpl = await fetchTemplate(templatesClient, args.templateId);
                const stripCredentials = args.stripCredentials ?? true;
                const nodes = (tpl.workflow.nodes ?? []).map((n) => {
                    const clone = { ...n };
                    delete clone.webhookId;
                    clone.id = randomUUID(); // ids do template não são reaproveitados (evita colisão entre deploys)
                    if (stripCredentials) delete clone.credentials;
                    return clone;
                });
                const created = await createWorkflowInternal(n8nClient, {
                    name: args.name ?? tpl.name,
                    nodes,
                    connections: tpl.workflow.connections ?? {}
                });
                return ok([
                    `Template "${tpl.name}" implantado como workflow "${created.name}" (inativo; sem auto-fix de typeVersion — revise credenciais manualmente).`,
                    JSON.stringify({ id: created.id, name: created.name }, null, 2)
                ]);
            }
            case "generate_workflow_draft": {
                if (!args.description) return err("generate_workflow_draft: campo 'description' é obrigatório");
                if (!llmClient?.hasApiKey) {
                    return err(
                        "generate_workflow_draft é opcional e exige uma chave de LLM por requisição. " +
                        "Envie o header X-LLM-API-KEY (e, opcionalmente, X-LLM-PROVIDER; padrão 'openai') para habilitá-la."
                    );
                }
                const draft = await llmClient.generateWorkflowDraft(args.description);
                return ok(JSON.stringify(draft, null, 2));
            }
            case "update_workflow_partial": {
                if (!args.id) return err("update_workflow_partial: campo 'id' é obrigatório");
                if (!Array.isArray(args.operations) || args.operations.length === 0) {
                    return err("update_workflow_partial: campo 'operations' (array não vazio) é obrigatório");
                }

                const current = await n8nClient.workflows.get(args.id);

                // Aplica tudo em memória primeiro; se qualquer operação falhar,
                // nada é enviado ao n8n (atomicidade — SPEC seção 5.2).
                let result;
                try {
                    result = applyWorkflowDiff(current, args.operations);
                } catch (e) {
                    return err(`update_workflow_partial: ${e.message} — nenhuma alteração foi enviada ao n8n.`);
                }

                const wf = result.workflow;
                const updated = await n8nClient.workflows.update(args.id, {
                    name:        wf.name,
                    nodes:       wf.nodes,
                    connections: wf.connections,
                    settings:    wf.settings ?? {}
                });

                // activateWorkflow/deactivateWorkflow usam os endpoints dedicados
                // do n8n (PUT não altera o estado ativo de forma confiável).
                if (result.activate === true)  await n8nClient.workflows.activate(args.id);
                else if (result.activate === false) await n8nClient.workflows.deactivate(args.id);

                const nodeValidationWarnings = collectNodeValidationWarnings(wf.nodes);
                const payload = { id: updated.id, name: updated.name, ...(nodeValidationWarnings.length ? { nodeValidationWarnings } : {}) };
                return ok([
                    `Workflow ${args.id} atualizado via ${args.operations.length} operação(ões) parcial(is).`,
                    JSON.stringify(payload, null, 2)
                ]);
            }
            case "validate_node_config": {
                if (!args.nodeType) return err("validate_node_config: campo 'nodeType' é obrigatório");
                const result = validateNodeConfig(args.nodeType, args.parameters ?? {});
                return ok(JSON.stringify(result, null, 2));
            }
            case "audit_instance": {
                const options = {};
                if (args.categories !== undefined) options.categories = args.categories;
                if (args.daysAbandonedWorkflow !== undefined) options.daysAbandonedWorkflow = args.daysAbandonedWorkflow;
                const data = await n8nClient.audit.generate(options);
                return ok(["Auditoria gerada.", JSON.stringify(data, null, 2)]);
            }
            default:
                return err(`Tool desconhecida: ${name}`);
        }
    } catch (e) {
        return err(e.message);
    }
}
