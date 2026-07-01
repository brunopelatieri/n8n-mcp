# Task 4 — `manage_credentials` com redação de logs

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 5.2 (item manage_credentials) e seção 7 item 3
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n modular (ver Task 1). Leia .context/spec/SPEC_N8N_TOOLS.md,
seção 5.2 (item manage_credentials) e seção 7 item 3 (redação de credenciais).

Tarefa: adicionar a tool manage_credentials { action: list|get|create|update|delete|
getSchema, id?, name?, type?, data? } envolvendo /credentials* do n8n.

Requisito crítico de segurança: o campo `data` (que contém os valores sensíveis da
credencial) NUNCA pode aparecer em:
- mensagens de erro devolvidas ao cliente MCP,
- console.log/console.error,
- stack traces.

Implemente uma função de redação central em src/n8n-client.js (ou módulo dedicado)
que mascara/remove `data` antes de qualquer log ou propagação de erro envolvendo
essa tool, e reutilize-a.

Restrições: JS puro, zero dependências novas.

Testes obrigatórios:
1. Happy path de cada action.
2. Teste específico que força um erro na chamada com action=create e confirma que a
   string `data` (e seus valores) NÃO aparece em nenhum log capturado nem na mensagem
   de erro devolvida pela tool.

Reporte: implementação da redação, e resultado de `npm test` incluindo o teste de
segurança acima passando.
```
