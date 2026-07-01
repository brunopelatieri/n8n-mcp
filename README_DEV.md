# 🤖 MCP n8n — Bru.ia
_Model Context Protocol Server for n8n Automation_

<p align="center">
  <a href="https://n8n.io/" target="_blank">
    <img src="https://img.shields.io/badge/n8n-Automation-EA4B71?logo=n8n&logoColor=white" />
  </a>
  <a href="https://cursor.sh/" target="_blank">
    <img src="https://img.shields.io/badge/Cursor-AI%20Integration-000000?logo=cursor&logoColor=white" />
  </a>
  <a href="https://www.docker.com/" target="_blank">
    <img src="https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker&logoColor=white" />
  </a>
  <a href="https://traefik.io/" target="_blank">
    <img src="https://img.shields.io/badge/Traefik-Reverse%20Proxy-24A1C1?logo=traefikproxy&logoColor=white" />
  </a>
</p>

---

## 🇧🇷 Visão Geral

Servidor **MCP (Model Context Protocol)** que conecta o **Cursor AI** ao **n8n**, permitindo criar, listar, editar e executar workflows diretamente pelo chat.

---

## 🏗️ Arquitetura

```
Cursor  ──stdio──▶  mcp-remote  ──HTTPS──▶  MCP Server  ──API──▶  n8n
```

---

## ⚡ Instalação no Cursor

### Localização do mcp.json

| Sistema | Caminho |
|----------|----------|
| Windows | %APPDATA%\Cursor\User\globalStorage\cursor.mcp\mcp.json |
| Mac | ~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/mcp.json |
| Linux | ~/.config/Cursor/User/globalStorage/cursor.mcp/mcp.json |

### Configuração

```jsonc
{
  "mcpServers": {
    "bmcp-n8n": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://bmcp.seudominio.com/mcp",
        "--header",
        "X-MCP-KEY:SUA-CHAVE",
        "--header",
        "X-N8N-URL:https://seu-n8n.com",
        "--header",
        "X-N8N-API-KEY:sua-api-key"
      ]
    }
  }
}
```

Reinicie o Cursor após salvar.

---

## 🐳 Docker Image

```
brunopelatieri/mcp-n8n-bruia:latest
```

---

## 🔐 Autenticação

Headers obrigatórios:

- X-MCP-KEY
- X-N8N-URL
- X-N8N-API-KEY

---

## 🛠️ Tools (22)

- list_workflows
- search_workflows
- get_workflow
- create_workflow
- update_workflow
- update_workflow_partial
- activate_workflow
- delete_workflow
- get_executions
- delete_execution
- execute_workflow_via_webhook
- get_workflow_as_template
- health_check
- manage_tags
- manage_variables
- manage_credentials
- audit_instance
- search_templates
- get_template
- deploy_template
- generate_workflow_draft
- validate_node_config

---

## 🔄 Atualizações recentes (2026-07-01)

- **Fase 1 completa (Tasks 0-9)**: refactor modular (`src/*.js`), 11 tools novas, `update_workflow_partial` (diff em memória em vez de reenviar o workflow inteiro), proteção SSRF real (`src/ssrf-guard.js`, `N8N_SSRF_MODE`), erros padronizados (`N8nApiError`), fallback opt-in de credenciais do servidor (`ALLOW_DEFAULT_N8N_CREDENTIALS`, default `false`).
- **Task 10 completa**: `validate_node_config` + `src/node-validator.js` — validação leve e estática (nunca bloqueia) contra 32 node-types curados manualmente em `data/node-validation-rules.json`. `create_workflow`/`update_workflow`/`update_workflow_partial` anexam `nodeValidationWarnings` best-effort quando há problema.
- **175 testes** (`node:test`, zero dependências) + CI (`.github/workflows/ci.yml`).

### ⚠️ Versão de referência da validação de nodes (`validate_node_config`)

`data/node-validation-rules.json` foi curado e validado lendo o **código-fonte real** de `n8n-io/n8n` (não instalamos `n8n-nodes-base` neste repo). Isso tem uma pegadinha de versão importante para quem for manter esse arquivo:

- `_meta.extractedFromVersion` = **`"2.29.0 (master, não lançado)"`** — a validação original foi feita contra a branch `master`, que fica à frente de qualquer tag publicada.
- Para reduzir o risco de "só funciona em código não lançado", reconfirmamos todos os pontos sensíveis (`_validationNotes`) contra a última **tag estável, `n8n@2.27.5`**. Resultado: o código relevante em `packages/nodes-base/{nodes,credentials}` é **byte-idêntico** entre a tag e `master` — ver bloco `_stableTagReconfirmation` dentro do próprio JSON para o detalhe por node-type.
- Essa reconfirmação encontrou e corrigiu 1 bug real (independente de versão): `gmail` `message.send` também exige o campo `message`, não só `sendTo`/`subject`.
- **Se você atualizar a instância n8n-alvo para outra major/minor**, não assuma que `data/node-validation-rules.json` continua correto — releia os arquivos-fonte dos nodes afetados antes de confiar em `known: true`/`errors`/`warnings` para eles. `scripts/extract-node-schemas.js` (devtool para automatizar essa extração) ainda não foi implementado — a curadoria continua manual.

---

## 🖥️ Deploy Docker Swarm

Criar rede:

```bash
docker network create --driver overlay --attachable bru
```

Criar secrets:

```bash
docker secret create n8n_url -
docker secret create n8n_api_key -
docker secret create mcp_allowed_keys -
```

Deploy via Portainer com stack apropriada.

---

## 🔒 Segurança

✔ HTTPS  
✔ Secrets Docker  
✔ Chaves individuais  
✔ JSON-RPC 2.0 via SSE  

---

## 👤 Autor

Bruno Pelatieri Goulart  
Enterprise AI Workflow Architect
