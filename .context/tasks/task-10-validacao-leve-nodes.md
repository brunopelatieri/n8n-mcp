# Task 10 — (Opcional) Validação leve de nodes

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 9.2.1 (completa)
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n com a Fase 1 implementada. Leia .context/spec/SPEC_N8N_TOOLS.md,
seção 9.2.1 completa (todas as subseções 9.2.1.1 a 9.2.1.7), antes de começar.

Tarefa: implementar a validação leve de node-types descrita na seção 9.2.1:
1. Gerar data/node-validation-rules.json com as regras curadas (requiredFields ou
   resourceField/operationField/resources) para os ~35 node-types listados em 9.2.1.1.
   Baseie os campos obrigatórios/enums no conhecimento real desses nodes do n8n
   (não precisa necessariamente instalar n8n-nodes-base — só faça isso se quiser
   conferir contra o pacote oficial; se instalar, lembre-se: é devDependency
   temporária, nunca deve ficar no package.json final nem na imagem Docker).
2. Criar src/node-validator.js com validateNodeConfig(nodeType, parameters) conforme
   pseudocódigo da seção 9.2.1.4 (enum inválido = erro; campo obrigatório vazio = warning).
3. Adicionar tool validate_node_config { nodeType, parameters }.
4. Em create_workflow, update_workflow e update_workflow_partial, anexar
   nodeValidationWarnings na resposta quando houver errors/warnings — NUNCA bloquear
   a chamada real ao n8n por causa disso.

Restrições: JS puro, sem banco de dados, n8n-nodes-base nunca como dependência de
runtime/produção.

Testes: validateNodeConfig com pelo menos 3 node-types (1 simples com requiredFields,
1 com resource/operation), validate_node_config tool, e teste confirmando que
create_workflow não bloqueia mesmo quando há warnings.

Reporte: lista final de node-types cobertos, exemplos de uso de validate_node_config,
e resultado de `npm test`.
```
