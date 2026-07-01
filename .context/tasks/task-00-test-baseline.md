# Task 0 — Baseline de testes + CI

**Depende de:** —
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 10
**Modelo sugerido:** Sonnet 5 (thinking-high)

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n em JavaScript puro (ESM), arquivos index.js +
secrets-reader.js na raiz. Existe uma SPEC completa em .context/spec/SPEC_N8N_TOOLS.md —
leia a seção 10 ("Testes automatizados e CI") antes de começar.

Tarefa: criar a base de testes ANTES de qualquer refactor, cobrindo o
comportamento atual do index.js (as 10 tools existentes) e do secrets-reader.js.

Restrições não-negociáveis:
- JS puro, ESM, sem TypeScript, sem build step.
- Zero dependências novas — use node:test e node:assert (nativos).
- Não modifique a lógica de index.js/secrets-reader.js nesta task, só adicione testes.

Faça:
1. Criar test/ com pelo menos: auth.test.js (parsing de MCP_ALLOWED_KEYS, aceitação/
   rejeição de X-MCP-KEY), e testes de "happy path"/"erro" para cada uma das 10 tools
   atuais (com fetch mockado — nenhum teste deve depender de rede real).
2. Adicionar script "test": "node --test test/" no package.json.
3. Criar .github/workflows/ci.yml conforme exemplo da seção 10.3 da SPEC.
4. Rodar `npm test` e garantir que tudo passa.

Reporte: quais arquivos foram criados, cobertura alcançada (quais tools/funções têm
teste), e o resultado da execução de `npm test`.
```
