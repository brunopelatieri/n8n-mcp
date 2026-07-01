# AI Context — bmcp-n8n (Servidor MCP para n8n)

**Identidade do projeto:** `bmcp-n8n` — servidor MCP (Model Context Protocol) minimalista para integração com n8n.
**Repo:** `n8n-mcp` (workspace local) | **Stack:** Node.js + Express, JavaScript puro (ESM)

Este arquivo é o ponto de entrada rápido para qualquer LLM/AI Agent entender o projeto antes de propor ou executar mudanças.

## Objetivo

Servidor MCP HTTP que expõe tools (JSON-RPC 2.0 via SSE) para que assistentes de IA (Claude, Cursor, etc.) consigam gerenciar workflows n8n (criar, listar, atualizar, executar) em nome de múltiplos usuários — cada um com sua própria instância/credencial n8n e sua própria chave de acesso ao MCP.

Princípio central: **simplicidade auditável**. Ver comparação completa com o projeto de referência [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp) no `README.md`.

## Arquivos Que Devem Ser Lidos Primeiro

1. `.context/onboarding/AI_CONTEXT.md` — este arquivo.
2. `.context/spec/TECHNICAL_SPEC_COMPACT.md` — stack, arquitetura, tools, deploy e regras em formato compacto. Leitura obrigatória antes de qualquer mudança técnica.
3. `.context/spec/SPEC_N8N_TOOLS.md` — SPEC completa de evolução das tools MCP (o "o quê" e o "como" de cada item do roadmap). Leitura obrigatória antes de implementar qualquer tool nova ou otimização.
4. `.context/adr/0001-simplicidade-vs-completude.md` — decisões de arquitetura e por que certas funcionalidades do projeto de referência foram ou não trazidas para cá.
5. `.context/tasks/README.md` — lista de tasks de implementação prontas (prompts), em ordem de execução.
6. `README.md` — visão geral, instalação, tools disponíveis.

## Arquitetura Atual (Fase 1 implementada — Tasks 0-9)

```
index.js -- Express + rotas + dispatch JSON-RPC (initialize, tools/list, tools/call, ping)
  |-- src/auth.js               -- valida X-MCP-KEY contra MCP_ALLOWED_KEYS
  |-- src/tools.js               -- inputSchema das 22 tools
  |-- src/tool-handlers.js       -- executeTool(name, args, n8nClient, templatesClient, llmClient)
  |     |-- src/n8n-client.js         -- client por recurso (workflows/executions/credentials/tags/variables/audit)
  |     |     |-- src/ssrf-guard.js   -- assertSafeUrl(url, {mode}) antes de qualquer fetch externo (N8N_SSRF_MODE)
  |     |     `-- N8nApiError         -- erro padronizado (status/code/message), API key nunca vaza na mensagem
  |     |-- src/workflow-diff.js      -- applyWorkflowDiff() para update_workflow_partial (GET -> diff em memória -> PUT)
  |     |-- src/templates-client.js   -- fetch https://api.n8n.io/api/templates (live, sem banco)
  |     |-- src/llm-client.js         -- fetch opt-in a provedor LLM (X-LLM-API-KEY do usuário, nunca persistida)
  |     `-- src/node-validator.js     -- validateNodeConfig() best-effort, lê data/node-validation-rules.json (32 node-types curados)
  `-- secrets-reader.js -- lê N8N_URL_FILE / N8N_API_KEY_FILE / MCP_ALLOWED_KEYS_FILE (Docker secrets) -> process.env
data/node-validation-rules.json  -- 32 node-types curados (lista da Bru.ia), validados contra n8n-io/n8n
test/*.test.js              -- node:test, 175 testes (zero dependências)
.github/workflows/ci.yml    -- CI
```

Credenciais n8n (`X-N8N-URL`/`X-N8N-API-KEY`) vêm por requisição (multi-tenant); fallback opcional para `process.env.N8N_URL`/`N8N_API_KEY` via `ALLOW_DEFAULT_N8N_CREDENTIALS=true` (opt-in, default `false`).

## Pendente (fora da Fase 1)

- **Fase 2** — `manage_datatable`, auditoria com varredura profunda de segredos.
- `scripts/extract-node-schemas.js` (devtool opcional, 9.2.1.3) não foi implementado — a curadoria de `data/node-validation-rules.json` foi feita manualmente/externamente (validada contra o código-fonte de `n8n-io/n8n`), sem instalar `n8n-nodes-base` neste repo.

## Regras de Decisão (não-negociáveis — ver seção 1 e 9.3 da SPEC)

- JavaScript puro (ESM). Nunca introduzir TypeScript, build step ou bundler.
- Nunca introduzir motor de banco de dados (SQLite, Postgres, etc.). Única exceção: `data/node-validation-rules.json` (arquivo estático curado, não é banco — seção 9.2.1).
- Nunca substituir o controle de acesso por usuário nomeado (`MCP_ALLOWED_KEYS`, header `X-MCP-KEY`) por um token único compartilhado. Cada usuário deve continuar revogável individualmente.
- Credenciais do n8n (`X-N8N-URL`/`X-N8N-API-KEY`) continuam vindo do cliente por requisição (multi-tenant); fallback para credenciais do servidor é opt-in (`ALLOW_DEFAULT_N8N_CREDENTIALS=true`), nunca o padrão.
- Não adicionar dependências de runtime novas sem justificar explicitamente (ver checklist de conformidade, seção 9.4 da SPEC).
- `n8n_workflow_versions` (histórico/rollback) está **permanentemente fora de escopo** — decisão deliberada, não limitação técnica (o n8n já tem isso nativamente). Ver `.context/adr/0001-simplicidade-vs-completude.md`.

## Quando Atualizar Contexto

Atualize este arquivo e `.context/spec/TECHNICAL_SPEC_COMPACT.md` quando mudar:

- Arquitetura/organização de arquivos (`src/*.js`).
- Lista de tools MCP disponíveis ou seus contratos (`inputSchema`).
- Modelo de autenticação ou de credenciais n8n.
- Deploy/Docker Swarm/secrets.
- Dependências do `package.json`.

Se a mudança alterar uma decisão já registrada em `.context/adr/`, crie um **novo** ADR referenciando o anterior (não edite o antigo).
Se a mudança afetar onboarding de usuários finais, atualize também `README.md`.

## Status Atual

- SPEC completa em `.context/spec/SPEC_N8N_TOOLS.md` — **Fase 1 implementada** (Tasks 0-9: refactor modular, otimizações, tools novas, `manage_credentials`, templates, `generate_workflow_draft`, `update_workflow_partial`, segurança/robustez transversal, docs) + **Task 10 implementada** (validação leve de nodes). `index.js` hoje expõe 22 tools.
- Pendente: Fase 2 (`manage_datatable`, auditoria com varredura profunda) — ver seção "Pendente" acima.
- Deploy atual: Docker Swarm + Portainer + Traefik, container único (~256 MB RAM / 0.5 vCPU), sem volume persistente.

## Mudanças (changelog deste contexto)

- **2026-07-01 (3)**: Fechado o placeholder de versão do Task 10. `_meta.extractedFromVersion` em `data/node-validation-rules.json` agora diz `"2.29.0 (master, não lançado)"` — a validação original foi contra a branch `master` do `n8n-io/n8n`, não uma tag estável. Para reduzir esse risco, reconfirmamos os 11 pontos sensíveis de `_validationNotes` diretamente contra a tag **`n8n@2.27.5`** (última release estável): via GitHub compare API, `packages/nodes-base/{nodes,credentials}` tem **0 arquivos diferentes** entre a tag e `master`, e cada ponto foi lido e confirmado diretamente no código-fonte da tag (não só inferido do diff vazio) — resultado documentado em `_stableTagReconfirmation` dentro do próprio JSON. Durante essa reconfirmação foi encontrada **1 correção real** (válida em ambas as versões, não é diferença entre elas): `gmail` `message.send` também exige o campo `message` (só `sendTo`+`subject` estavam listados) — corrigido em `data/node-validation-rules.json` e nos testes (`test/node-validator.test.js`, 175/175 continuam passando). Regra prática daqui para frente: se o n8n-alvo mudar de major/minor, revalidar `_validationNotes` contra o código-fonte da nova versão antes de confiar cegamente no arquivo.
- **2026-07-01 (2)**: Task 10 implementada — `validate_node_config` + `src/node-validator.js` + `data/node-validation-rules.json` (32 node-types curados manualmente a partir da lista de uso real da Bru.ia, validados contra o código-fonte de `n8n-io/n8n` — não os ~35 genéricos originalmente sugeridos pela SPEC). Suporta 3 formatos de regra: `requiredFields` simples, `resourceField`+`operationField` com sub-recurso (ex.: gmail, googleSheets), e `operationField` sozinho sem sub-recurso (ex.: postgres, mySql, supabase, redis, ftp — extensão ao pseudocódigo original da SPEC 9.2.1.4). Integração best-effort em `create_workflow`/`update_workflow`/`update_workflow_partial` via `nodeValidationWarnings` — nunca bloqueia a chamada real ao n8n. `n8n-nodes-base` não foi instalado neste repo (curadoria externa/manual, `scripts/extract-node-schemas.js` continua não implementado). 23 testes novos (152 → 175). `_meta.extractedFromVersion` em `data/node-validation-rules.json` ficou com placeholder — preencher quando a versão-alvo do n8n for definida.
- **2026-07-01**: Fase 1 da SPEC implementada (Tasks 0-9) — refactor modular (`src/*.js`), otimizações em tools existentes, 11 tools novas, `update_workflow_partial` (diff), segurança/robustez transversal (`N8nApiError`, SSRF guard conectado em `n8n-client.js`, `ALLOW_DEFAULT_N8N_CREDENTIALS` opt-in, limpeza de dependências não usadas em `package.json`) e 152 testes (`node:test`) + CI. `README.md`, este arquivo e `TECHNICAL_SPEC_COMPACT.md` atualizados para refletir a arquitetura final implementada (deixaram de descrever algo "planejado"). Pendente: Task 10 (validação leve de nodes, opcional) e Fase 2.
- **2026-06-30**: criação da SPEC completa (`docs/SPEC_N8N_TOOLS.md`), comparação com `czlonkowski/n8n-mcp` documentada no `README.md`, decisão de não implementar `n8n_workflow_versions` (n8n já tem nativamente), e quebra da SPEC em 11 tasks de implementação (`.context/tasks/`). Estrutura `.context/` criada.
- **2026-06-30**: SPEC migrada de `docs/SPEC_N8N_TOOLS.md` para `.context/spec/SPEC_N8N_TOOLS.md`, seguindo o padrão da pasta `.context/`. Todas as referências cruzadas (`README.md`, `AI_CONTEXT.md`, `TECHNICAL_SPEC_COMPACT.md`, ADR, tasks) atualizadas para o novo caminho.
