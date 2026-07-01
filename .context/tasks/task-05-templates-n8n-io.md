# Task 5 — Templates do n8n.io

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 5.2.1 (itens search_templates, get_template, deploy_template)
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n modular (ver Task 1). Leia .context/spec/SPEC_N8N_TOOLS.md,
seção 5.2.1 (itens search_templates, get_template, deploy_template) antes de começar.
NÃO implemente generate_workflow_draft aqui (é a Task 6).

Tarefa:
1. Criar src/templates-client.js — wrapper fino para https://api.n8n.io/api/templates
   (search e getById), usando node-fetch (já presente no package.json, nenhuma
   dependência nova). Host é uma constante fixa no código (não vem de input do
   cliente) — por isso NÃO precisa passar pelo src/ssrf-guard.js.
2. Adicionar tool search_templates { search?, limit?, cursor? } —
   GET .../templates/search?page=&rows=&search=, devolvendo lista resumida
   { id, name, description, totalViews, nodes[] }.
3. Adicionar tool get_template { templateId } —
   GET .../templates/workflows/{templateId}, devolvendo
   { id, name, description, workflow: { nodes, connections, settings } }.
4. Adicionar tool deploy_template { templateId, name?, stripCredentials? } — busca o
   template, remove id/webhookId dos nodes (igual ao get_workflow_as_template), e se
   stripCredentials (default true) remove referências de credentials dos nodes; depois
   chama internamente create_workflow. Sem auto-fix de typeVersion.

Restrições: JS puro, zero dependências novas, sem persistência/cache local.

Testes: mocke o fetch para a API do n8n.io (NUNCA chame a API real nos testes) e cubra
happy path + erro de cada tool, incluindo a limpeza de id/webhookId/credentials em
deploy_template.

Reporte: tools adicionadas e resultado de `npm test`.
```
