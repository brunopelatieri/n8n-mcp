// src/workflow-diff.js
//
// Motor simplificado de diff ops para update_workflow_partial (SPEC seção 5.2).
// Aplica uma lista de operações sobre uma CÓPIA em memória do workflow (obtido
// via GET) e devolve o workflow resultante — nunca faz I/O. A atomicidade é
// garantida por construção: como toda a lista é aplicada sobre um clone e um
// erro em qualquer operação interrompe o processo com throw, o chamador só
// deve enviar o PUT quando applyWorkflowDiff retorna com sucesso.
//
// Conexões do n8n são indexadas por NOME do node (não por id):
//   connections[sourceName][sourceOutput][sourceIndex] = [ { node, type, index }, ... ]

import { randomUUID } from "node:crypto";

// ─── Helpers de referência a node ─────────────────────────────────────────────

/** Resolve um node por nodeId OU nodeName. Lança erro claro se ausente/inexistente. */
function resolveNode(workflow, { nodeId, nodeName }) {
    if (!nodeId && !nodeName) throw new Error("informe nodeId ou nodeName");
    const node = workflow.nodes.find((n) => (nodeId && n.id === nodeId) || (nodeName && n.name === nodeName));
    if (!node) throw new Error(`node não encontrado (${nodeId ?? nodeName})`);
    return node;
}

/** Resolve uma referência (nome OU id) para o NOME do node — usado nas conexões. */
function resolveNodeName(workflow, ref) {
    if (ref === undefined || ref === null || ref === "") throw new Error("referência de node vazia");
    const node = workflow.nodes.find((n) => n.name === ref || n.id === ref);
    if (!node) throw new Error(`node "${ref}" não encontrado`);
    return node.name;
}

// ─── Helpers de dot-path ──────────────────────────────────────────────────────

function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    let cur = obj;
    for (const k of keys) {
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
        cur = cur[k];
    }
    cur[last] = value;
}

// ─── Conexões ─────────────────────────────────────────────────────────────────

/** Renomeia um node em todas as conexões (chave de origem e alvos). */
function renameInConnections(workflow, oldName, newName) {
    const conns = workflow.connections ?? {};
    if (conns[oldName]) {
        conns[newName] = conns[oldName];
        delete conns[oldName];
    }
    for (const src of Object.keys(conns)) {
        for (const output of Object.keys(conns[src])) {
            conns[src][output] = conns[src][output].map((slot) =>
                Array.isArray(slot) ? slot.map((c) => (c.node === oldName ? { ...c, node: newName } : c)) : slot
            );
        }
    }
}

// ─── Operações ────────────────────────────────────────────────────────────────

function addNode(wf, op) {
    const node = op.node;
    if (!node || typeof node !== "object") throw new Error('campo "node" (objeto) é obrigatório');
    for (const f of ["name", "type", "position"]) {
        if (node[f] === undefined) throw new Error(`node.${f} é obrigatório`);
    }
    if (wf.nodes.some((n) => n.name === node.name)) throw new Error(`já existe um node chamado "${node.name}"`);
    wf.nodes.push({ typeVersion: 1, parameters: {}, ...node, id: node.id ?? randomUUID() });
}

function removeNode(wf, op) {
    const node = resolveNode(wf, op);
    wf.nodes = wf.nodes.filter((n) => n !== node);
    const conns = wf.connections ?? {};
    delete conns[node.name];
    for (const src of Object.keys(conns)) {
        for (const output of Object.keys(conns[src])) {
            conns[src][output] = conns[src][output].map((slot) =>
                Array.isArray(slot) ? slot.filter((c) => c.node !== node.name) : slot
            );
        }
    }
}

function updateNode(wf, op) {
    const node = resolveNode(wf, op);
    if (!op.updates || typeof op.updates !== "object") throw new Error('campo "updates" (objeto) é obrigatório');
    const oldName = node.name;
    for (const [path, value] of Object.entries(op.updates)) setPath(node, path, value);
    if (node.name !== oldName) renameInConnections(wf, oldName, node.name);
}

function patchNodeField(wf, op) {
    const node = resolveNode(wf, op);
    if (!op.fieldPath) throw new Error('campo "fieldPath" é obrigatório');
    if (!Array.isArray(op.patches) || op.patches.length === 0) throw new Error('campo "patches" (array não vazio) é obrigatório');
    let value = getPath(node, op.fieldPath);
    if (typeof value !== "string") throw new Error(`campo "${op.fieldPath}" não é uma string (ou não existe) no node "${node.name}"`);
    for (const patch of op.patches) {
        if (patch.find === undefined || patch.replace === undefined) throw new Error('cada patch exige "find" e "replace"');
        if (patch.regex) {
            value = value.replace(new RegExp(patch.find, patch.replaceAll ? "g" : ""), patch.replace);
        } else if (patch.replaceAll) {
            value = value.split(patch.find).join(patch.replace);
        } else {
            value = value.replace(patch.find, patch.replace);
        }
    }
    setPath(node, op.fieldPath, value);
}

function moveNode(wf, op) {
    const node = resolveNode(wf, op);
    if (!Array.isArray(op.position) || op.position.length !== 2 || !op.position.every((n) => typeof n === "number")) {
        throw new Error('campo "position" deve ser [x, y] numérico');
    }
    node.position = [...op.position];
}

function setNodeDisabled(wf, op, disabled) {
    const node = resolveNode(wf, op);
    if (disabled) node.disabled = true;
    else delete node.disabled; // enableNode remove a flag em vez de deixar disabled:false
}

function addConnection(wf, op) {
    const source = resolveNodeName(wf, op.source);
    const target = resolveNodeName(wf, op.target);
    const sourceOutput = op.sourceOutput ?? "main";
    const targetInput  = op.targetInput ?? "main";
    const sourceIndex  = op.sourceIndex ?? 0;
    const targetIndex  = op.targetIndex ?? 0;

    const conns   = (wf.connections ??= {});
    const bySource = (conns[source] ??= {});
    const outputs  = (bySource[sourceOutput] ??= []);
    while (outputs.length <= sourceIndex) outputs.push([]);
    if (!Array.isArray(outputs[sourceIndex])) outputs[sourceIndex] = [];
    const slot = outputs[sourceIndex];
    if (!slot.some((c) => c.node === target && c.type === targetInput && c.index === targetIndex)) {
        slot.push({ node: target, type: targetInput, index: targetIndex });
    }
}

function removeConnection(wf, op) {
    const source = resolveNodeName(wf, op.source);
    const target = resolveNodeName(wf, op.target);
    const sourceOutput = op.sourceOutput ?? "main";
    const outputs = wf.connections?.[source]?.[sourceOutput];
    let removed = 0;
    if (Array.isArray(outputs)) {
        for (const slot of outputs) {
            if (!Array.isArray(slot)) continue;
            for (let i = slot.length - 1; i >= 0; i--) {
                if (slot[i].node === target) { slot.splice(i, 1); removed++; }
            }
        }
    }
    if (removed === 0 && !op.ignoreErrors) {
        throw new Error(`conexão de "${source}" para "${target}" (${sourceOutput}) não encontrada`);
    }
}

function updateSettings(wf, op) {
    if (!op.settings || typeof op.settings !== "object") throw new Error('campo "settings" (objeto) é obrigatório');
    wf.settings = { ...(wf.settings ?? {}), ...op.settings };
}

function updateName(wf, op) {
    if (typeof op.name !== "string" || op.name === "") throw new Error('campo "name" (string não vazia) é obrigatório');
    wf.name = op.name;
}

/**
 * Aplica uma lista de operações de diff sobre uma cópia do workflow.
 *
 * @param {object} workflow    workflow atual (resultado de GET /workflows/{id})
 * @param {Array}  operations  lista de operações (ver SPEC seção 5.2)
 * @returns {{ workflow: object, activate: (boolean|undefined) }}
 *          workflow resultante para PUT + flag de ativação a aplicar depois
 *          (undefined = não mexer no estado ativo).
 * @throws  {Error} com mensagem específica por operação; nada é persistido.
 */
export function applyWorkflowDiff(workflow, operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
        throw new Error("operations deve ser um array não vazio");
    }
    const wf = structuredClone(workflow);
    wf.nodes ??= [];
    wf.connections ??= {};

    let activate; // undefined | true | false

    operations.forEach((op, i) => {
        const label = `operação #${i} (${op?.type ?? "sem type"})`;
        try {
            switch (op?.type) {
                case "addNode":            addNode(wf, op); break;
                case "removeNode":         removeNode(wf, op); break;
                case "updateNode":         updateNode(wf, op); break;
                case "patchNodeField":     patchNodeField(wf, op); break;
                case "moveNode":           moveNode(wf, op); break;
                case "enableNode":         setNodeDisabled(wf, op, false); break;
                case "disableNode":        setNodeDisabled(wf, op, true); break;
                case "addConnection":      addConnection(wf, op); break;
                case "removeConnection":   removeConnection(wf, op); break;
                case "updateSettings":     updateSettings(wf, op); break;
                case "updateName":         updateName(wf, op); break;
                case "activateWorkflow":   activate = true;  wf.active = true;  break;
                case "deactivateWorkflow": activate = false; wf.active = false; break;
                default: throw new Error(`tipo de operação desconhecido: "${op?.type}"`);
            }
        } catch (e) {
            throw new Error(`${label}: ${e.message}`);
        }
    });

    return { workflow: wf, activate };
}
