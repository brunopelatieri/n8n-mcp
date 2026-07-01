// src/node-validator.js
//
// Validação leve e estática de node-types comuns (SPEC seção 9.2.1.4).
// Lê data/node-validation-rules.json (curado manualmente, sem n8n-nodes-base
// em runtime). Best-effort: node-type fora da lista -> known:false, nunca erro.

import rules from "../data/node-validation-rules.json" with { type: "json" };

export function validateNodeConfig(nodeType, parameters = {}) {
    const rule = rules[nodeType];
    if (!rule) return { known: false, errors: [], warnings: [] };

    const errors = [];
    const warnings = [];
    const checkRequiredFields = (fields, label) => {
        for (const field of fields ?? []) {
            const value = parameters[field];
            if (value === undefined || value === "") {
                warnings.push(`Campo "${field}" normalmente obrigatório para ${label} está vazio ou ausente.`);
            }
        }
    };

    if (rule.resourceField) {
        const resource = parameters[rule.resourceField];
        if (resource !== undefined) {
            const resourceRule = rule.resources?.[resource];
            if (!resourceRule) {
                errors.push(`resource "${resource}" inválido para ${nodeType}. Válidos: ${Object.keys(rule.resources ?? {}).join(", ")}`);
            } else {
                const operation = parameters[rule.operationField];
                if (operation !== undefined) {
                    const opRule = resourceRule.operations?.[operation];
                    if (!opRule) {
                        errors.push(`operation "${operation}" inválida para resource "${resource}" em ${nodeType}. Válidas: ${Object.keys(resourceRule.operations ?? {}).join(", ")}`);
                    } else {
                        checkRequiredFields(opRule.requiredFields, `${nodeType} (${resource}.${operation})`);
                    }
                }
            }
        }
    } else if (rule.operationField) {
        // Nodes sem seletor de "resource" (ex.: postgres, mySql, supabase,
        // redis, ftp) — operation direto no topo, sem aninhamento.
        const operation = parameters[rule.operationField];
        if (operation !== undefined) {
            const opRule = rule.operations?.[operation];
            if (!opRule) {
                errors.push(`operation "${operation}" inválida para ${nodeType}. Válidas: ${Object.keys(rule.operations ?? {}).join(", ")}`);
            } else {
                checkRequiredFields(opRule.requiredFields, `${nodeType} (${operation})`);
            }
        }
    }

    checkRequiredFields(rule.requiredFields, nodeType);
    return { known: true, errors, warnings };
}
