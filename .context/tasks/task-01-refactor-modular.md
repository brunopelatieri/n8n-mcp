# Task 1 — Refactor modular (sem mudar comportamento)

**Depende de:** Task 0
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 4
**Modelo sugerido:** Opus 4.8 (thinking-high) — maior risco de regressão por ser refactor amplo

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n em JS puro (ESM). A Task 0 já criou test/ e CI cobrindo
o comportamento atual do index.js. Leia .context/spec/SPEC_N8N_TOOLS.md, seção 4 ("Nova
organização de arquivos") antes de começar.

Tarefa: extrair o index.js atual (Express + lógica de auth + makeN8nRequest +
getToolDefinitions + executeTool) em módulos, SEM alterar nenhum comportamento
observável (refactor puro 1:1).

Restrições não-negociáveis:
- JS puro, ESM, sem TypeScript, sem build step, zero dependências novas.
- Preservar exatamente a lógica de autenticação atual: X-MCP-KEY validado contra
  MCP_ALLOWED_KEYS (usuários nomeados, revogáveis individualmente), credenciais n8n
  sempre via X-N8N-URL/X-N8N-API-KEY por requisição. Não mude esse comportamento.

Crie:
- src/auth.js — middleware de validação de X-MCP-KEY (lógica hoje embutida no index.js).
- src/n8n-client.js — substitui makeN8nRequest, com métodos por recurso (workflows.*,
  executions.*, conforme o que já existe hoje; os métodos novos virão em tasks futuras).
- src/ssrf-guard.js — crie o módulo com assertSafeUrl(url, {mode}) conforme seção 7
  item 1 da SPEC, mas AINDA NÃO precisa estar conectado em nenhuma tool nesta task
  (isso é da Task 2) — só crie o módulo com testes próprios.
- src/tools.js — array de inputSchema das 10 tools atuais.
- src/tool-handlers.js — dispatcher executeTool(name, args, n8nClient).
- index.js — fica só com Express + rotas + dispatch JSON-RPC, importando os módulos acima.

Depois do refactor:
1. Rode os testes da Task 0 SEM modificá-los — todos devem continuar passando exatamente
   como antes (isso garante que o comportamento não mudou).
2. Adicione testes unitários novos para src/ssrf-guard.js (bloqueio de loopback/metadata
   169.254.169.254, modos strict/moderate/off).

Reporte: estrutura final de arquivos, resultado de `npm test` (testes antigos + novos),
e confirme explicitamente que nenhum comportamento da API mudou.
```
