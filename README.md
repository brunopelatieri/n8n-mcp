# 🤖 MCP n8n — Bru.ia

Servidor MCP (Model Context Protocol) que conecta o **Cursor AI** ao **n8n**, permitindo criar, listar, editar e executar workflows diretamente pelo chat do Cursor.

---

## ⚡ Instalação rápida no Cursor

Edite o arquivo `mcp.json` do Cursor com as credenciais fornecidas pelo administrador:

**Localização do arquivo:**
- **Windows:** `%APPDATA%\Cursor\User\globalStorage\cursor.mcp\mcp.json`
- **Mac:** `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/mcp.json`
- **Linux:** `~/.config/Cursor/User/globalStorage/cursor.mcp/mcp.json`

```jsonc
{
  "mcpServers": {
    "bmcp-n8n": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://bmcp.bru.ia.br/mcp",
        "--header",
        "X-MCP-KEY:SUA-CHAVE-PESSOAL",
        "--header",
        "X-N8N-URL:https://seu-n8n.exemplo.com",
        "--header",
        "X-N8N-API-KEY:sua-api-key-do-n8n"
      ]
    }
  }
}
```

> Após salvar, reinicie o Cursor. O servidor `bmcp-n8n` aparecerá disponível no chat.

---

## 🐳 Imagem Docker

A imagem oficial está publicada no Docker Hub por **Bruno Pelatieri Goulart**:

🔗 [https://hub.docker.com/u/brunopelatieri](https://hub.docker.com/u/brunopelatieri)

```
brunopelatieri/mcp-n8n-bruia:latest
```

> ⚠️ **Sempre use a tag `latest`** para garantir que está rodando a versão mais recente com todas as correções e melhorias.

---

## 🏗️ Como funciona

```
Cursor  ──stdio──▶  mcp-remote  ──HTTPS──▶  Servidor MCP  ──API──▶  n8n
```

1. O **Cursor** se comunica via stdio com o `mcp-remote` (proxy local instalado via `npx`)
2. O **mcp-remote** traduz stdio → HTTP e envia as requisições para o servidor remoto
3. O **Servidor MCP** autentica a requisição, valida os headers e chama a API do n8n
4. O **n8n** executa a operação e retorna o resultado

### Autenticação por camadas

| Header | Descrição |
|---|---|
| `X-MCP-KEY` | Chave pessoal do usuário — controla quem pode usar o servidor |
| `X-N8N-URL` | URL da instância n8n do usuário |
| `X-N8N-API-KEY` | API key da instância n8n do usuário |

Todos os três headers são **obrigatórios** por padrão. Sem eles a requisição é rejeitada — exceto se o administrador do servidor habilitar `ALLOW_DEFAULT_N8N_CREDENTIALS=true` (ver "Variáveis de ambiente opcionais" abaixo), caso em que `X-N8N-URL`/`X-N8N-API-KEY` ausentes caem para um n8n padrão do servidor; `X-MCP-KEY` continua sempre obrigatório.

### Ferramentas disponíveis

22 tools no total — workflows/execuções (com paginação e modos leves de detalhe), gestão de instância (credenciais/tags/variáveis/auditoria), templates do n8n.io, geração de workflow via IA (opt-in) e validação leve de node-types.

| Tool | Descrição |
|---|---|
| `list_workflows` | Lista workflows, com paginação (`limit`/`cursor`) e filtros (`active`, `tags`) |
| `search_workflows` | Busca workflows pelo nome (percorre todas as páginas) |
| `get_workflow` | Retorna detalhes de um workflow pelo ID (`mode`: full/structure/minimal/filtered) |
| `create_workflow` | Cria um novo workflow |
| `update_workflow` | Atualiza um workflow existente (GET+merge+PUT, com fallback PUT→PATCH) |
| `update_workflow_partial` | Atualiza um workflow via operações de diff (addNode, removeNode, updateNode, moveNode, addConnection, etc.), sem reenviar o JSON inteiro |
| `activate_workflow` | Ativa ou desativa um workflow |
| `delete_workflow` | Remove um workflow permanentemente |
| `get_executions` | Lista execuções recentes de um workflow, com paginação, filtro por `status` e `mode` (preview/full) |
| `delete_execution` | Remove uma execução pelo ID |
| `execute_workflow_via_webhook` | Executa workflow via webhook (protegido por SSRF guard) |
| `get_workflow_as_template` | Exporta workflow como template reutilizável |
| `health_check` | Verifica se a instância n8n está respondendo |
| `manage_tags` | Gerencia tags (listar, criar, atualizar, remover, atribuir a um workflow) |
| `manage_variables` | Gerencia variáveis de ambiente do n8n |
| `manage_credentials` | Gerencia credenciais do n8n (o campo `data` nunca é exposto em erros/logs) |
| `audit_instance` | Gera um relatório de auditoria de segurança da instância n8n |
| `search_templates` | Busca templates de workflow no n8n.io (live, sem cache/banco local) |
| `get_template` | Retorna detalhes de um template do n8n.io antes de importar |
| `deploy_template` | Importa um template do n8n.io como novo workflow |
| `generate_workflow_draft` | Gera uma proposta de workflow via LLM externo (opt-in, requer `X-LLM-API-KEY` do próprio usuário) |
| `validate_node_config` | Validação leve e estática de um node contra uma lista curada de 32 node-types comuns (`{ known, errors, warnings }`, nunca bloqueia) |

> 📐 **Roadmap restante:** a Fase 1 (Tasks 0-9) e a Task 10 (validação leve de node-types) da SPEC estão implementadas. Ainda pendente, por decisão de escopo: a Fase 2 (`manage_datatable`, auditoria com varredura profunda). Detalhes em [`.context/spec/SPEC_N8N_TOOLS.md`](.context/spec/SPEC_N8N_TOOLS.md), inspirada no projeto [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp).

---

## 🖥️ Instalação no servidor (Docker Swarm + Portainer)

### Pré-requisitos

- Docker Swarm inicializado
- Portainer instalado
- Traefik configurado como reverse proxy com Let's Encrypt
- Rede Docker externa chamada `bru` criada:
  ```bash
  docker network create --driver overlay --attachable bru
  ```

---

### 1. Criar os secrets Docker

Os secrets armazenam credenciais de forma segura — nunca ficam expostos em variáveis de ambiente ou logs.

#### Secret: `n8n_url`
URL da instância n8n padrão do servidor (fallback — não usada se o usuário passar `X-N8N-URL`):
```bash
echo "https://seu-n8n.exemplo.com" | docker secret create n8n_url -
```

#### Secret: `n8n_api_key`
API key do n8n padrão do servidor:
```bash
echo "sua-api-key-aqui" | docker secret create n8n_api_key -
```

#### Secret: `mcp_allowed_keys`
Lista de usuários autorizados e suas chaves pessoais. O formato é `nome:chave` separados por vírgula:

```bash
# Gere uma chave para cada usuário:
openssl rand -hex 32
# Exemplo de saída: a1b2c3d4e5f6...

# Crie o secret com todos os usuários:
echo "bruno:CHAVE-DO-BRUNO,joao:CHAVE-DO-JOAO,maria:CHAVE-DA-MARIA" \
  | docker secret create mcp_allowed_keys -
```

> **Para adicionar ou revogar um usuário:** remova o secret antigo, recrie com a lista atualizada e atualize o service:
> ```bash
> docker secret rm mcp_allowed_keys
> echo "bruno:CHAVE-BRUNO,novousuario:NOVA-CHAVE" | docker secret create mcp_allowed_keys -
> docker service update --force mcp-bru_smcp
> ```

#### Verificar secrets criados:
```bash
docker secret ls
```

---

### Variáveis de ambiente opcionais

Nenhuma delas é obrigatória — o comportamento padrão (sem defini-las) é o mesmo de antes.

| Variável | Padrão | Descrição |
|---|---|---|
| `N8N_SSRF_MODE` | `moderate` | Proteção contra SSRF para `X-N8N-URL` e URLs de webhook. `off` desliga a checagem; `moderate` bloqueia loopback e metadata de nuvem (`169.254.169.254`), mas permite IP privado (comum em n8n self-hosted em rede interna); `strict` também bloqueia IP privado (RFC1918) e link-local. |
| `ALLOW_DEFAULT_N8N_CREDENTIALS` | `false` | Se `true`, quando a requisição não enviar `X-N8N-URL`/`X-N8N-API-KEY`, o servidor usa `N8N_URL`/`N8N_API_KEY` (secrets `n8n_url`/`n8n_api_key` acima) como tenant padrão. Headers por requisição sempre têm precedência sobre esse fallback. Use só se quiser um "n8n padrão" compartilhado além do modelo multi-tenant. |

---

### 2. Deploy com Docker Compose no Portainer

No Portainer, vá em **Stacks → Add Stack**, cole o conteúdo abaixo e clique em **Deploy**:

```yaml
version: '3.8'

services:
  smcp:
    image: brunopelatieri/mcp-n8n-bruia:latest
    networks:
      - bru
    healthcheck:
      disable: true
    environment:
      - N8N_URL_FILE=/run/secrets/n8n_url
      - N8N_API_KEY_FILE=/run/secrets/n8n_api_key
      - MCP_ALLOWED_KEYS_FILE=/run/secrets/mcp_allowed_keys
      - NODE_ENV=production
      # Opcionais — ver "Variáveis de ambiente opcionais" acima. Comportamento
      # padrão (sem defini-las) é idêntico ao de antes.
      # - N8N_SSRF_MODE=moderate
      # - ALLOW_DEFAULT_N8N_CREDENTIALS=false
    secrets:
      - n8n_url
      - n8n_api_key
      - mcp_allowed_keys
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
      resources:
        limits:
          memory: 256M
          cpus: "0.5"
      labels:
        - traefik.enable=true
        - traefik.docker.network=bru
        - traefik.http.routers.bmcp.rule=Host(`bmcp.bru.ia.br`)
        - traefik.http.routers.bmcp.entrypoints=websecure
        - traefik.http.routers.bmcp.tls=true
        - traefik.http.routers.bmcp.tls.certresolver=letsencryptresolver
        - traefik.http.services.bmcp-svc.loadbalancer.server.port=3000
        # Mantém conexão SSE aberta (necessário para MCP)
        - traefik.http.middlewares.bmcp-buffer.buffering.maxRequestBodyBytes=0
        - traefik.http.routers.bmcp.middlewares=bmcp-buffer

networks:
  bru:
    external: true
    name: bru

secrets:
  n8n_url:
    external: true
  n8n_api_key:
    external: true
  mcp_allowed_keys:
    external: true
```

> ⚠️ Substitua `bmcp.bru.ia.br` pelo seu próprio domínio.

---

### 3. Verificar o deploy

```bash
# Ver status do service
docker service ps mcp-bru_smcp

# Ver logs
docker service logs mcp-bru_smcp --follow

# Testar o health endpoint
curl https://bmcp.bru.ia.br/health
```

Resposta esperada:
```json
{ "status": "ok", "time": "2026-02-28T..." }
```

---

### 4. Testar uma tool via curl

```bash
curl -X POST https://bmcp.bru.ia.br/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-MCP-KEY:sua-chave" \
  -H "X-N8N-URL:https://seu-n8n.exemplo.com" \
  -H "X-N8N-API-KEY:sua-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_workflows",
      "arguments": {}
    }
  }'
```

---

## 👤 Gerenciar usuários

### Adicionar novo usuário

1. Gere uma chave:
   ```bash
   openssl rand -hex 32
   ```

2. Atualize o secret `mcp_allowed_keys`:
   ```bash
   docker secret rm mcp_allowed_keys
   echo "bruno:CHAVE-BRUNO,novousuario:NOVA-CHAVE" | docker secret create mcp_allowed_keys -
   docker service update --force mcp-bru_smcp
   ```

3. Envie para o usuário o `mcp.json` com a chave gerada.

### Revogar acesso

Remova a entrada do usuário da lista e atualize o secret — sem afetar os demais usuários.

---

## 🔒 Segurança

- Comunicação sempre via **HTTPS** (Traefik + Let's Encrypt)
- Secrets nunca expostos em variáveis de ambiente ou logs
- Cada usuário tem **chave individual** — revogação granular sem afetar outros
- Cada usuário usa suas **próprias credenciais n8n** — sem compartilhamento (fallback para credenciais padrão do servidor é opt-in, ver `ALLOW_DEFAULT_N8N_CREDENTIALS`)
- Header `X-MCP-KEY` é sempre obrigatório; `X-N8N-URL`/`X-N8N-API-KEY` são obrigatórios por padrão
- **Proteção SSRF** (`N8N_SSRF_MODE`) valida o host de `X-N8N-URL` e de URLs de webhook antes de qualquer chamada externa, bloqueando loopback e metadata de nuvem por padrão
- **Erros padronizados**: a API key do n8n nunca aparece em mensagens de erro devolvidas ao cliente MCP; o campo `data` de credenciais nunca é exposto em erros ou logs

---

## 🛠️ Tecnologias

- **Node.js** com Express
- **Protocolo MCP** (Model Context Protocol) — JSON-RPC 2.0 via SSE
- **mcp-remote** — proxy stdio↔HTTP para Cursor
- **Docker Swarm** com secrets nativos
- **Traefik** como reverse proxy com TLS automático

---

## ⚖️ Simplicidade vs. completude — comparação com o [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp)

Este projeto (`bmcp-n8n`) é, deliberadamente, uma versão **mínima e auditável** de um servidor MCP para n8n. Avaliamos o projeto de referência [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp) — muito mais completo — para decidir o que vale a pena trazer para cá (ver [`.context/spec/SPEC_N8N_TOOLS.md`](.context/spec/SPEC_N8N_TOOLS.md)) e o que **não** vale, dado o objetivo deste servidor.

> 🙏 **Créditos**: [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp) (22k+ estrelas, licença MIT) é criado e mantido por **[@czlonkowski](https://github.com/czlonkowski)**. Toda a análise comparativa abaixo, e boa parte do roadmap em [`.context/spec/SPEC_N8N_TOOLS.md`](.context/spec/SPEC_N8N_TOOLS.md), foi inspirada e referenciada a partir do código-fonte desse projeto (uma cópia local dele foi usada como referência de leitura em `model-n8n-czlonkowski/`, apenas para estudo — nenhum código dele foi copiado para este repositório). Veja o projeto original e considere apoiar o autor: [github.com/czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp).

### Filosofia de cada projeto

| | `bmcp-n8n` (este projeto) | `czlonkowski/n8n-mcp` |
|---|---|---|
| Linguagem | JavaScript puro (ESM), sem build step | TypeScript, compilado, com testes automatizados |
| Persistência | Nenhuma (stateless) | SQLite local com documentação de 500+ nodes do n8n + cache de templates |
| Tamanho do código | ~330 linhas em 2 arquivos | Centenas de arquivos (`services/`, `mcp/`, `parsers/`, `validators/` etc.) |
| Tools MCP | 22 (workflows/execuções com paginação e modos leves, credenciais, tags, variáveis, auditoria, templates do n8n.io, geração via IA opt-in, diff parcial de workflow, validação leve de node-types) | ~17 tools de gestão de instância + tools de documentação/validação de nodes (uso local, não documentadas aqui) |
| Deploy | 1 container, 256 MB de RAM, sem volume | Container maior, exige banco de dados embarcado e processo de build/rebuild do índice de nodes |
| Modelo de uso | Multiusuário remoto (SaaS interno) | Pensado para 1 usuário local (Claude Desktop/Code) ou 1 instância HTTP por deployment |

### Controle de acesso por usuário — a diferença mais relevante

Esse foi o ponto levantado na conversa, e é real: **a forma de autenticação dos dois projetos é fundamentalmente diferente.**

- **`bmcp-n8n` (este projeto):** o secret `mcp_allowed_keys` guarda uma lista `nome:chave,nome:chave,...`. Cada pessoa tem sua própria chave (`X-MCP-KEY`), que aparece nomeada no log (`[auth] usuário autenticado: bruno`) e pode ser **revogada individualmente** (remover só a entrada da pessoa, sem afetar as demais — ver seção "Gerenciar usuários" acima). Além disso, cada usuário informa as próprias credenciais de n8n (`X-N8N-URL`/`X-N8N-API-KEY`) — nunca compartilhadas.
- **`czlonkowski/n8n-mcp` (modo HTTP remoto):** a autenticação usa um único `AUTH_TOKEN` (Bearer) **compartilhado por todos os clientes** daquele deployment (ver `model-n8n-czlonkowski/docs/HTTP_DEPLOYMENT.md` e `model-n8n-czlonkowski/src/http-server.ts`). Para revogar o acesso de uma única pessoa, é preciso trocar o token — o que desconecta **todo mundo**, não só quem perdeu o acesso. O projeto modelo **suporta**, sim, apontar para instâncias n8n diferentes por requisição via headers `x-n8n-url`/`x-n8n-key` (`InstanceContext`, em `model-n8n-czlonkowski/src/types/instance-context.ts`), mas isso é independente da camada de autenticação MCP — não existe, nativamente, um conceito de "usuários nomeados com chave individual" como o `mcp_allowed_keys` deste projeto.

Ou seja: **não é a multi-tenância de credenciais n8n que falta no modelo mais completo** (ele também suporta isso) — é o **controle de acesso por usuário nomeado e individualmente revogável na camada MCP**, que é uma característica própria deste projeto simples e não está disponível pronta no projeto modelo.

### Vantagens do modelo simples (`bmcp-n8n`)

- **Controle de acesso granular por usuário** (ver acima) — vantagem real e específica deste projeto, que o [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp) não tem nativamente em modo HTTP.
- **Onboarding e deploy instantâneos**: sem build, sem TypeScript, sem precisar gerar/baixar um banco SQLite de nodes (o projeto de referência precisa rodar um script de `rebuild` para popular `data/nodes.db` antes de funcionar).
- **Superfície de ataque pequena**: poucas centenas de linhas em poucos arquivos, auditável por completo em minutos. O projeto de referência tem centenas de arquivos TypeScript (92% do código).
- **Pegada de recursos mínima**: cabe no limite de 256 MB/0.5 vCPU já configurado no `docker-compose.yml`; não precisa de volume persistente para banco de dados.
- **Cada usuário usa sua própria instância/credencial n8n** sem custo de infraestrutura adicional por usuário (nenhum estado de sessão por tenant precisa ser gerenciado no servidor).
- **Cobertura funcional praticamente equivalente, já com a Fase 1 e a Task 10 implementadas, sem nenhuma das desvantagens estruturais acima**: este projeto já cobre praticamente todas as tools de gestão de instância do projeto de referência (workflows, execuções, credenciais, tags, variáveis, auditoria, templates do n8n.io, geração de workflow via IA opt-in, validação leve de node-types) — restando apenas a Fase 2 (futura) e uma única exclusão deliberada (ver abaixo), não por limitação técnica.

### Desvantagens / limitações atuais (em relação ao [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp))

A Fase 1 da SPEC (Tasks 0-9) e a Task 10 (validação leve de node-types) já estão implementadas — a maior parte das antigas limitações abaixo foi resolvida. É importante separar **"decisão deliberada de não implementar"** de **"ainda pendente, já especificado"** — só existe **uma** funcionalidade do projeto de referência na primeira categoria:

- **Histórico/rollback de versões de workflow (`n8n_workflow_versions`) — única funcionalidade que NÃO será implementada, por decisão deliberada.** O próprio n8n já oferece nativamente um histórico de versões do workflow (Workflow History, na própria interface do n8n, a cada salvamento) — recurso da plataforma n8n em si, não do servidor MCP. Reimplementar isso no lado do MCP exigiria abrir mão do princípio "sem persistência local" (guardar snapshots em arquivo/SQLite próprio) só para duplicar uma capacidade que o usuário já tem disponível direto no n8n. Por isso, **esta é a única tool do projeto de referência que decidimos não trazer para este projeto** — não é uma limitação técnica, é uma escolha de não duplicar algo que já existe na plataforma de base.
- Já implementado (Fase 1, Tasks 0-9, e Task 10) — deixou de ser uma desvantagem:
  - Proteção SSRF real (`src/ssrf-guard.js`, configurável via `N8N_SSRF_MODE`) — seção 7, item 1.
  - Tools de credenciais/tags/variáveis/auditoria de instância (`manage_credentials`, `manage_tags`, `manage_variables`, `audit_instance`) — seção 5.2.
  - Templates do n8n.io (`search_templates`/`get_template`/`deploy_template`, live, sem banco) e geração de workflow via IA opt-in (`generate_workflow_draft`) — seção 5.2.1.
  - Respostas leves por padrão (`mode` em `get_workflow`/`get_executions`, paginação em `list_workflows`) — seção 5.1.
  - `update_workflow_partial` (diff de operações, sem reenviar o workflow inteiro) — seção 5.2.
  - Erros padronizados (`N8nApiError`) e fallback opt-in de credenciais do servidor (`ALLOW_DEFAULT_N8N_CREDENTIALS`) — seção 7.
  - Validação leve e estática de node-types (`validate_node_config`, 32 node-types curados a partir do uso real da Bru.ia) — seção 9.2.1.
  - Testes automatizados (`node:test`, 175 testes) e CI (GitHub Actions) — seção 10.
- Ainda pendente:
  - Fase 2: `manage_datatable`, auditoria com varredura profunda de segredos.

> 🔎 Em outras palavras: com a Fase 1 e a Task 10 implementadas, a única diferença funcional remanescente entre este projeto e o [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp) — além da Fase 2 — é a ausência do `n8n_workflow_versions`, e essa ausência é intencional, pois a funcionalidade equivalente já existe nativamente no próprio n8n. Análise completa em [`.context/spec/SPEC_N8N_TOOLS.md`](.context/spec/SPEC_N8N_TOOLS.md) (seção 9 — "Mitigação das desvantagens").

### O que foi implementado (mantendo a simplicidade e o controle por usuário)

A implementação detalhada está em [`.context/spec/SPEC_N8N_TOOLS.md`](.context/spec/SPEC_N8N_TOOLS.md). Os princípios não-negociáveis, respeitados em toda a Fase 1, foram:

1. **JavaScript puro (ESM), sem build step e sem TypeScript** — código reorganizado em módulos (`src/auth.js`, `src/n8n-client.js`, `src/ssrf-guard.js`, `src/tools.js`, `src/tool-handlers.js`, `src/templates-client.js`, `src/llm-client.js`, `src/workflow-diff.js`, `src/node-validator.js`).
2. **Nenhum banco de dados introduzido** — todas as tools chamam diretamente a API REST do n8n (sem SQLite de documentação de nodes).
3. **Controle de acesso por usuário nomeado e individualmente revogável preservado** (`MCP_ALLOWED_KEYS`) — nenhuma tool nova substitui esse modelo por um token único compartilhado.
4. **Tools novas (Fase 1, implementadas)**: `delete_execution`, `health_check`, `manage_credentials`, `manage_tags`, `manage_variables`, `audit_instance`, `update_workflow_partial`, `search_templates`, `get_template`, `deploy_template` (live, sem banco) e `generate_workflow_draft` (opt-in, via `X-LLM-API-KEY` próprio — nenhuma chave de IA compartilhada no servidor).
5. **Otimizações nas tools existentes (Fase 1, implementadas)**: paginação real em `list_workflows`/`get_executions`, modos leves de detalhe em `get_workflow` (`full`/`structure`/`minimal`/`filtered`), proteção SSRF em `execute_workflow_via_webhook` **e em todas as chamadas do cliente n8n** (`src/n8n-client.js`, configurável via `N8N_SSRF_MODE`), fallback PUT→PATCH em `update_workflow`, erros padronizados (`N8nApiError`) e fallback opt-in de credenciais do servidor (`ALLOW_DEFAULT_N8N_CREDENTIALS`).
6. **Testes e CI**: `node:test` (nativo, zero dependências, 175 testes) + GitHub Actions (`.github/workflows/ci.yml`) — ver seção 10 da SPEC.
7. **Fase 2 (não implementada ainda)**: `manage_datatable`, auditoria com varredura profunda de segredos.
8. **Validação leve de nodes (Task 10, implementada)**: tool `validate_node_config` + `src/node-validator.js`, baseada em um arquivo JSON estático (`data/node-validation-rules.json`) curado manualmente para 32 node-types — a lista de uso real da própria operação Bru.ia, não os ~35 genéricos originalmente sugeridos pela SPEC — e validado diretamente contra o código-fonte de `n8n-io/n8n` (não instala `n8n-nodes-base` no repo). Sem SQLite, sem pipeline de build em produção. Nunca bloqueia: `create_workflow`/`update_workflow`/`update_workflow_partial` anexam `nodeValidationWarnings` best-effort quando há `errors`/`warnings`. Detalhes completos (formato do JSON, módulo de validação, integração) em [`.context/spec/SPEC_N8N_TOOLS.md`](.context/spec/SPEC_N8N_TOOLS.md), seção 9.2.1.
   - ⚠️ **Nota sobre a versão de validação**: `data/node-validation-rules.json._meta.extractedFromVersion` = `"2.29.0 (master, não lançado)"` — a curadoria foi validada contra a branch `master` do `n8n-io/n8n`, não uma tag de release estável. Para reduzir esse risco, todos os pontos sensíveis foram reconfirmados (2026-07-01) contra a última release estável, **`n8n@2.27.5`**: o código-fonte relevante (`packages/nodes-base/{nodes,credentials}`) é **idêntico** entre as duas versões (ver `_stableTagReconfirmation` no próprio JSON). Se a instância n8n-alvo mudar de major/minor no futuro, revalide `data/node-validation-rules.json` contra o código-fonte da nova versão antes de confiar cegamente nele — `known: true` só significa "reconhecido pela curadoria", não "garantido para qualquer versão do n8n".
9. **Não será implementado, por decisão deliberada**: `workflow_versions` (histórico/rollback de versões) — o n8n já oferece isso nativamente (Workflow History na própria interface); duplicar essa capacidade no MCP exigiria armazenamento local só para repetir algo que já existe na plataforma. Ver seção 9.2 da SPEC.