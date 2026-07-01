# Task 6 — `generate_workflow_draft` (LLM opt-in)

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 5.2.1 (item generate_workflow_draft) e seção 7 item 8
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n modular (ver Task 1). Leia .context/spec/SPEC_N8N_TOOLS.md,
seção 5.2.1 (item generate_workflow_draft) e seção 7 item 8 (chave de LLM nunca
persistida) antes de começar.

Tarefa:
1. Criar src/llm-client.js — wrapper fino via node-fetch para um endpoint de chat
   completion compatível com OpenAI (sem adicionar SDK de IA como dependência —
   NÃO instale openai, @anthropic-ai/sdk, etc.).
2. Adicionar tool generate_workflow_draft { description } que:
   - Exige o header X-LLM-API-KEY (obrigatório) e aceita X-LLM-PROVIDER (opcional,
     default openai).
   - A chave NUNCA é lida de process.env, nunca é persistida, nunca aparece em log.
   - Devolve só o JSON proposto de workflow (nodes/connections) como texto — sem
     deploy automático, sem cache de propostas.
   - Se X-LLM-API-KEY não vier, a tool retorna erro explicando que é opcional e como
     habilitá-la, mas a tool continua aparecendo normalmente em tools/list.

Restrições: JS puro, zero dependências novas, servidor continua stateless.

Testes: mocke o fetch ao provedor LLM, cubra: erro claro quando falta X-LLM-API-KEY,
happy path com chave presente, e confirme que a chave nunca aparece em nenhum log
capturado durante os testes.

Reporte: implementação e resultado de `npm test`.
```
