# Task 8 — Segurança/robustez transversal + limpeza de `package.json`

**Depende de:** Tasks 2, 3, 4, 5, 6, 7
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 7
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n com todas as tools das Tasks 2-7 já implementadas.
Leia .context/spec/SPEC_N8N_TOOLS.md, seção 7 ("Segurança e robustez"), por completo.

Tarefa: aplicar os itens da seção 7 que ainda não estão cobertos pelas tasks
anteriores:
1. Confirmar que src/ssrf-guard.js está conectado em TODAS as chamadas com host
   vindo do cliente (X-N8N-URL e webhook), com modo configurável via env
   N8N_SSRF_MODE=strict|moderate|off (default moderate).
2. Padronizar erros: criar um N8nApiError simples em src/n8n-client.js (status, code,
   message), garantindo que a API key do n8n nunca apareça em nenhuma mensagem de erro.
3. Resposta enxuta por padrão: confirmar que get_workflow/list_workflows/get_executions
   usam modos leves como default (não dump de JSON gigante).
4. Implementar o fallback de credenciais do servidor (gap original do secrets-reader.js):
   se X-N8N-URL/X-N8N-API-KEY ausentes E ALLOW_DEFAULT_N8N_CREDENTIALS=true, usar
   process.env.N8N_URL/N8N_API_KEY (vindos do secrets-reader.js) como tenant padrão —
   opt-in explícito, comportamento padrão (env ausente/false) deve continuar exigindo
   os headers por requisição.
5. Revisar package.json: remover @modelcontextprotocol/sdk e redis se de fato não
   forem usados em nenhum import (confirme com grep antes de remover), ou documentar
   por que permanecem.
6. Confirmar (auditoria, não precisa codar nada novo) que NENHUMA tool nova substituiu
   o modelo de autenticação por usuário nomeado (MCP_ALLOWED_KEYS) por um token único.

Restrições: JS puro, sem build step.

Reporte: o que foi alterado em cada item 1-6, e resultado de `npm test` ao final.
```
