# ADR 0001 — Simplicidade vs. Completude (comparação com czlonkowski/n8n-mcp)

**Status:** Aceito
**Data:** 2026-06-30
**Contexto:** `.context/spec/SPEC_N8N_TOOLS.md`, `README.md` (seção "Simplicidade vs. completude")

## Contexto

Avaliamos o projeto de referência [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp)
(MIT, 22k+ estrelas, criado e mantido por [@czlonkowski](https://github.com/czlonkowski))
para decidir quais dos seus recursos valeria a pena trazer para o `bmcp-n8n`, mantendo a
filosofia deste projeto: JavaScript puro (ESM), sem build step, sem TypeScript, sem banco
de dados, e controle de acesso por usuário nomeado e individualmente revogável.

## Decisões

### D1 — Manter JS puro / sem build / sem TypeScript (rígido)
Não negociável em nenhuma circunstância. Ver seção 9.3 da SPEC.

### D2 — Manter autenticação por usuário nomeado via secret (rígido)
`MCP_ALLOWED_KEYS` (`X-MCP-KEY`) é uma vantagem real sobre o `AUTH_TOKEN` único do
projeto de referência (modo HTTP) — permite revogação individual sem afetar outros
usuários. Nenhuma tool ou refactor pode substituir esse modelo por um token compartilhado.

### D3 — Mitigar SSRF, tools limitadas, respostas "cheias", templates do n8n.io e geração
via IA — sem violar D1/D2 (aceito)
Todos esses itens foram especificados na SPEC (seções 5 e 7) sem exigir banco de dados
nem dependências novas. Templates e geração via LLM são chamadas `fetch` *live*, sem
cache/persistência local; a geração via LLM é opt-in, com chave própria do usuário
(`X-LLM-API-KEY`), nunca compartilhada nem persistida no servidor.

### D4 — Validação semântica de nodes: meio-termo aceito (exceção controlada ao "sem dado")
Paridade completa com o projeto de referência exigiria o mesmo pipeline de SQLite com
500+ nodes (violaria três princípios ao mesmo tempo: sem banco, sem pipeline de build,
complexidade desproporcional). Aceitamos uma única exceção controlada: um arquivo JSON
estático, curado manualmente, cobrindo os ~35 node-types mais comuns, gerado a partir do
pacote npm oficial `n8n-nodes-base` (a mesma fonte de verdade usada pelo projeto de
referência) — nunca um banco de dados, nunca um pipeline de build em produção.
Detalhamento completo: seção 9.2.1 da SPEC.

### D5 — Histórico/rollback de versões de workflow: rejeitado permanentemente
**Decisão:** não implementar `n8n_workflow_versions` em nenhuma forma — nem a versão
"fraca" (1 snapshot por workflow, sem histórico de N versões nem diff) que seria
tecnicamente viável sem banco de dados completo.

**Motivo:** o n8n já oferece nativamente um histórico de versões do workflow
(*Workflow History*, na própria interface, a cada salvamento, restaurável pela UI da
instância). Isso é um recurso da **plataforma n8n**, independente de qual cliente MCP
está conectado a ela. A versão do projeto de referência (`n8n_workflow_versions`) é uma
reimplementação própria do servidor MCP (SQLite paralelo + backup automático antes de
cada update + rollback via API), pensada para cenários onde esse histórico nativo não
está disponível ou acessível — não é o caso de uso deste projeto.

**Consequência:** esta é a **única** funcionalidade do projeto de referência que fica
permanentemente fora do roadmap do `bmcp-n8n`, por escolha deliberada — e não por
limitação técnica do princípio "sem banco de dados" (diferente de D4, que tem um
meio-termo viável e foi aceito).

## Créditos

Toda a análise comparativa parte do código-fonte de
[czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp) (22k+ estrelas, MIT),
de autoria de [@czlonkowski](https://github.com/czlonkowski). Uma cópia local desse
repositório foi usada como material de estudo em `model-n8n-czlonkowski/` (apenas
leitura/referência — nenhum código foi copiado para este projeto).

## Referências

- `.context/spec/SPEC_N8N_TOOLS.md`, seções 1, 3 e 9.
- `README.md`, seção "Simplicidade vs. completude".
