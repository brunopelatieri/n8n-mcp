# Task 2 — Otimizações em tools existentes

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 5.1
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n, já refatorado em módulos (src/auth.js, src/n8n-client.js,
src/ssrf-guard.js, src/tools.js, src/tool-handlers.js — ver Task 1). Leia
.context/spec/SPEC_N8N_TOOLS.md, seção 5.1, antes de começar.

Tarefa: aplicar as otimizações da seção 5.1 às tools existentes, mantendo os nomes
(sem breaking change):
- get_workflow: adicionar `mode` opcional (full|structure|minimal|filtered) e `nodeNames`.
- list_workflows: adicionar limit, cursor, active, tags reais (com paginação), devolver nextCursor.
- search_workflows: reusar a listagem paginada internamente.
- create_workflow: validar shape mínimo de cada node (id, name, type, typeVersion, position,
  parameters) antes de enviar, com erro claro.
- update_workflow: manter GET+merge+PUT, adicionar fallback PUT→PATCH em 405.
- get_executions: adicionar cursor, status, mode (preview|full).
- execute_workflow_via_webhook: validar a URL com src/ssrf-guard.js (modo default
  "moderate", configurável via env N8N_SSRF_MODE) antes do fetch; aceitar httpMethod e headers.
- get_workflow_as_template: remover também webhookId dos nodes de webhook (hoje só remove id).

Restrições: JS puro, sem dependências novas, sem mudar nomes de tools, sem quebrar
contratos de quem já usa essas tools sem os novos parâmetros opcionais (devem ter
defaults que preservam o comportamento atual).

Para cada tool otimizada, adicione/atualize testes em test/ cobrindo: comportamento
default (igual ao de antes) e os novos parâmetros/modos.

Reporte: lista de tools alteradas, parâmetros novos de cada uma, e resultado de `npm test`.
```
