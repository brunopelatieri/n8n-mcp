# Tasks de Implementação — .context/spec/SPEC_N8N_TOOLS.md

Esta pasta quebra a SPEC (`.context/spec/SPEC_N8N_TOOLS.md`) em 11 tasks sequenciais, cada uma
como um prompt independente e autocontido — pode ser colado em sessões de chat
separadas (cada arquivo repete o contexto mínimo necessário, já que pode não haver
histórico de conversa anterior na sessão de destino).

## Como usar

1. Abra `task-00-...md` e copie todo o conteúdo do bloco de código em "Prompt".
2. Cole numa nova sessão de chat (com o mesmo repositório aberto).
3. Espere a implementação terminar e confirme que `npm test` passou.
4. Avance para a próxima task na ordem da tabela abaixo (respeitando a coluna "Depende de").

Task 0 é pré-requisito de todas as outras. As tasks 2-7 podem, em teoria, ser feitas
em qualquer ordem entre si (todas dependem só da Task 1), mas a ordem sugerida segue o
roadmap da seção 8 da SPEC.

## Tabela de tasks

| # | Arquivo | Task | Depende de | Seção da SPEC | Modelo sugerido |
|---|---|---|---|---|---|
| 0 | `task-00-test-baseline.md` | Baseline de testes + CI | — | 10 | Sonnet 5 thinking-high |
| 1 | `task-01-refactor-modular.md` | Refactor modular (sem mudar comportamento) | 0 | 4 | Opus 4.8 thinking-high |
| 2 | `task-02-otimizacoes-tools-existentes.md` | Otimizações em tools existentes | 1 | 5.1 | Sonnet 5 thinking-high |
| 3 | `task-03-tools-novas-simples.md` | Tools novas simples (health/tags/variáveis/auditoria/delete_execution) | 1 | 5.2 (parte) | Sonnet 5 thinking-high |
| 4 | `task-04-manage-credentials.md` | `manage_credentials` + redação de logs | 1 | 5.2 (parte) | Sonnet 5 thinking-high |
| 5 | `task-05-templates-n8n-io.md` | Templates do n8n.io | 1 | 5.2.1 (parte) | Sonnet 5 thinking-high |
| 6 | `task-06-generate-workflow-draft.md` | `generate_workflow_draft` (LLM opt-in) | 1 | 5.2.1 (parte) | Sonnet 5 thinking-high |
| 7 | `task-07-update-workflow-partial.md` | `update_workflow_partial` (diff ops) | 1 | 5.2 (parte) | Opus 4.8 thinking-high |
| 8 | `task-08-seguranca-robustez.md` | Segurança/robustez transversal + limpeza `package.json` | 2,3,4,5,6,7 | 7 | Sonnet 5 thinking-high |
| 9 | `task-09-atualizar-docs.md` | Atualizar README/docker-compose/secrets | 8 | — | Sonnet 5 thinking-high |
| 10 | `task-10-validacao-leve-nodes.md` | (Opcional) Validação leve de nodes | 1 | 9.2.1 | Sonnet 5 thinking-high |

## Princípios repetidos em toda task (não remover ao adaptar os prompts)

- JS puro (ESM), sem TypeScript, sem build step.
- Zero dependências de runtime novas, salvo justificativa explícita.
- Preservar o modelo de autenticação por usuário nomeado (`MCP_ALLOWED_KEYS`/`X-MCP-KEY`).
- `n8n_workflow_versions` nunca deve ser implementado (ver `.context/adr/0001-simplicidade-vs-completude.md`).

Ver também `.context/onboarding/AI_CONTEXT.md` e `.context/spec/TECHNICAL_SPEC_COMPACT.md`
para o contexto geral do projeto.
