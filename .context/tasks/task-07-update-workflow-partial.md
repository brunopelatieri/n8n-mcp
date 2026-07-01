# Task 7 — `update_workflow_partial` (diff ops)

**Depende de:** Task 1
**Seção da SPEC:** `.context/spec/SPEC_N8N_TOOLS.md`, seção 5.2 (item update_workflow_partial)
**Modelo sugerido:** Opus 4.8 (thinking-high) — item de maior complexidade da SPEC

## Prompt (copie tudo abaixo para uma nova sessão de chat)

```
Repositório: servidor MCP n8n modular (ver Task 1). Leia .context/spec/SPEC_N8N_TOOLS.md,
seção 5.2 (item update_workflow_partial) com atenção total — é o item de maior
complexidade da SPEC.

Tarefa: implementar a tool update_workflow_partial { id, operations[] }, que faz
GET workflow → aplica as operações em memória → PUT, evitando reenviar nodes/connections
inteiros quando não necessário.

Operações a suportar (subconjunto definido na SPEC): addNode, removeNode, updateNode,
patchNodeField (fieldPath + patches: [{find, replace}]), moveNode, enableNode,
disableNode, addConnection, removeConnection, updateSettings, updateName,
activateWorkflow, deactivateWorkflow.

Implemente como um motor simplificado e bem testado — não precisa replicar 100% das
validações do projeto de referência, mas cada operação precisa:
- validar inputs (ex.: addConnection exige nodeId de origem e destino existentes),
- falhar com erro claro e específico por operação quando o input é inválido,
- não corromper o workflow em caso de erro no meio de uma lista de operações (processe
  tudo em memória primeiro; só faz PUT se todas as operações da lista forem válidas).

Restrições: JS puro, zero dependências novas.

Testes obrigatórios: pelo menos 1 teste por tipo de operação (happy path) + pelo menos
2 testes de erro (operação com input inválido, operação referenciando node inexistente)
+ 1 teste com múltiplas operações na mesma chamada (batch).

Reporte: lista de operações implementadas, exemplos de payload de cada uma, e
resultado de `npm test`.
```
