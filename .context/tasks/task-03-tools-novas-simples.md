# Task 3 — Tools novas simples

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 5.2 (parte)
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n modular (ver Task 1). Leia .context/spec/SPEC_N8N_TOOLS.md,
seção 5.2, antes de começar (apenas os itens abaixo — manage_credentials e
update_workflow_partial são tasks separadas, NÃO implemente aqui).

Tarefa: adicionar as seguintes tools novas, todas via src/n8n-client.js +
src/tool-handlers.js + src/tools.js:
- delete_execution { id } — DELETE /executions/{id}.
- health_check {} — tenta /healthz, fallback GET /workflows?limit=1; devolve
  { ok, n8nVersion?, latencyMs }. NÃO inclua modo "diagnostic" que despeja env vars.
- manage_tags { action: list|create|update|delete|assign, id?, name?, workflowId?, tagIds? }.
- manage_variables { action: list|create|update|delete, id?, key?, value? } — trate 404
  graciosamente (nem toda instância expõe essa API).
- audit_instance { categories?, daysAbandonedWorkflow? } — passthrough formatado de
  POST /audit (API nativa do n8n).

Restrições: JS puro, zero dependências novas, sem alterar a lógica de autenticação.

Adicione testes para cada tool nova (happy path + erro/input inválido + o caso 404
gracioso de manage_variables).

Reporte: tools adicionadas, exemplos de input/output de cada uma, e resultado de `npm test`.
```
