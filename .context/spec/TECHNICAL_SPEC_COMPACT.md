# bmcp-n8n — Technical Spec (Compact)

**Projeto:** servidor MCP (Model Context Protocol) para n8n, multiusuário, stateless.
**Docs completos:** `SPEC_N8N_TOOLS.md` (nesta pasta) — SPEC de evolução de tools, com todo o detalhamento técnico de cada item abaixo.

---

## 1. Arquitetura

```
Cliente MCP (Claude/Cursor via mcp-remote)
  |
  v
index.js (Express)
  |-- POST /mcp  (JSON-RPC 2.0: initialize, tools/list, tools/call, ping)
  |-- GET  /mcp  (SSE keep-alive)
  |
  |-- Autenticação: header X-MCP-KEY validado contra MCP_ALLOWED_KEYS (secrets-reader.js)
  |
  `-- Por chamada de tool: fetch direto à API REST do n8n usando
      X-N8N-URL / X-N8N-API-KEY do header da requisição (multi-tenant)
```

**Decisão crítica:** sem estado no servidor — nenhuma sessão, nenhum cache, nenhum banco. Cada requisição é autocontida (chave MCP + credenciais n8n vêm sempre da requisição). Ver `.context/adr/0001-simplicidade-vs-completude.md`.

---

## 2. Stack

| Camada | Ferramenta |
|---|---|
| Runtime | Node.js (ESM) |
| Servidor HTTP | Express |
| Protocolo | MCP — JSON-RPC 2.0 via SSE |
| Cliente IDE | `mcp-remote` (proxy stdio↔HTTP) |
| HTTP client interno | `node-fetch` |
| Testes | `node:test` nativo (zero dependências) — 175 testes |
| Deploy | Docker Swarm + secrets nativos + Traefik (TLS automático) |

Sem TypeScript, sem build step, sem ORM, sem banco de dados.

---

## 3. Estrutura de Arquivos (implementada)

```
index.js                  Express + rotas + dispatch JSON-RPC (só isso)
src/
├── auth.js               valida X-MCP-KEY contra MCP_ALLOWED_KEYS
├── n8n-client.js         client por recurso (workflows/executions/credentials/tags/variables/audit) + N8nApiError
├── ssrf-guard.js         assertSafeUrl(url, {mode}) — N8N_SSRF_MODE
├── workflow-diff.js      applyWorkflowDiff() para update_workflow_partial
├── templates-client.js   fetch https://api.n8n.io/api/templates
├── llm-client.js         fetch opt-in a provedor LLM (X-LLM-API-KEY do usuário)
├── node-validator.js     validateNodeConfig() — validação leve estática (9.2.1), lê data/node-validation-rules.json
├── tools.js              inputSchema das 22 tools
└── tool-handlers.js      executeTool(name, args, n8nClient, templatesClient, llmClient)
data/
└── node-validation-rules.json  32 node-types curados manualmente (lista da Bru.ia), validados contra n8n-io/n8n
test/
└── *.test.js              node:test (175 testes)
secrets-reader.js          Docker secrets (*_FILE) -> process.env
package.json
docker-compose.yml
.github/workflows/ci.yml
```

**Pendente** (não implementado, fora de escopo por ora):
```
scripts/extract-node-schemas.js     (opcional, 9.2.1) devtool, nunca em produção — curadoria atual foi manual/externa
```

---

## 4. Modelo de Autenticação (não mexer sem ADR novo)

- **Camada MCP:** header `X-MCP-KEY`, validado contra `MCP_ALLOWED_KEYS` (secret Docker, formato `nome:chave,nome:chave,...`). Revogação individual por usuário, sem afetar os demais.
- **Camada n8n:** headers `X-N8N-URL` / `X-N8N-API-KEY` por requisição (multi-tenant). Fallback para credenciais do servidor (`process.env.N8N_URL`/`N8N_API_KEY`, carregadas por `secrets-reader.js`) é opt-in via `ALLOW_DEFAULT_N8N_CREDENTIALS=true` (implementado, seção 7 item 5 da SPEC) — nunca o padrão.

---

## 5. Tools MCP

### Atuais (22)
`list_workflows`, `search_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `update_workflow_partial`, `activate_workflow`, `delete_workflow`, `get_executions`, `delete_execution`, `execute_workflow_via_webhook`, `get_workflow_as_template`, `health_check`, `manage_tags`, `manage_variables`, `manage_credentials`, `audit_instance`, `search_templates`, `get_template`, `deploy_template`, `generate_workflow_draft`, `validate_node_config`.

- **Otimizações implementadas:** modos leves em `get_workflow` (`full`/`structure`/`minimal`/`filtered`)/`get_executions` (`preview`/`full`), paginação real em `list_workflows`/`get_executions`, fallback PUT→PATCH em `update_workflow`, SSRF guard em `execute_workflow_via_webhook` e em `src/n8n-client.js` (todas as chamadas à API do n8n).
- **`validate_node_config` (Task 10, implementada):** validação leve e estática contra 32 node-types curados manualmente (`data/node-validation-rules.json`, lista da própria operação Bru.ia, validada contra o código-fonte de `n8n-io/n8n`). Nunca bloqueia — `create_workflow`/`update_workflow`/`update_workflow_partial` anexam `nodeValidationWarnings` best-effort na resposta quando há `errors`/`warnings`.
  - **Versão-alvo da validação:** `data/node-validation-rules.json._meta.extractedFromVersion` = `"2.29.0 (master, não lançado)"` — validado contra a branch `master`, não uma tag estável. Reconfirmado (2026-07-01) contra a última release estável `n8n@2.27.5`: código-fonte idêntico em `packages/nodes-base/{nodes,credentials}` entre as duas versões (ver `_stableTagReconfirmation` no próprio JSON). Se o n8n-alvo mudar de major/minor, revalidar antes de confiar no arquivo.

### Pendentes (ver .context/spec/SPEC_N8N_TOOLS.md, seções 5 e 6)

- **Fora de escopo definitivo:** `n8n_workflow_versions` (ver ADR 0001).
- **Fora de escopo (Fase 2/futuro):** `manage_datatable`, `audit_instance` deep scan.

---

## 6. Deploy

- Docker Swarm + Portainer, container único, ~256 MB RAM / 0.5 vCPU, sem volume persistente.
- Traefik como reverse proxy com TLS automático.
- Secrets via Docker Swarm secrets (`N8N_URL_FILE`, `N8N_API_KEY_FILE`, `MCP_ALLOWED_KEYS_FILE`).
- Envs opcionais (default preserva o comportamento anterior): `N8N_SSRF_MODE` (`strict|moderate|off`, default `moderate`) e `ALLOW_DEFAULT_N8N_CREDENTIALS` (`true|false`, default `false`).

---

## 7. Onde Encontrar Mais Detalhes

- `.context/spec/SPEC_N8N_TOOLS.md` — especificação completa (formato de cada tool, pseudocódigo, segurança, testes/CI).
- `.context/adr/0001-simplicidade-vs-completude.md` — por que cada decisão de escopo foi tomada.
- `.context/tasks/` — prompts de implementação prontos, um por etapa do roadmap.
- `README.md` — instalação, uso, comparação com o projeto de referência.
