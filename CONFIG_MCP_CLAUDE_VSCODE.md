# 🔌 bmcp-n8n — Configuração MCP para Claude Desktop, Claude Code e Cursor

> **Guia completo para conectar o servidor MCP remoto do n8n aos três principais ambientes de desenvolvimento com IA** — Claude Desktop App, Claude Code (CLI) e VS Code / Cursor IDE — com segurança de credenciais e validação de conexão.

[![n8n](https://img.shields.io/badge/-n8n-FF5C37?style=flat-square&logo=n8n&logoColor=white)](https://n8n.io/)
[![MCP](https://img.shields.io/badge/-MCP%20Protocol-6366F1?style=flat-square&logo=anthropic&logoColor=white)](https://modelcontextprotocol.io/)
[![Claude](https://img.shields.io/badge/-Claude%20Desktop-CC785C?style=flat-square&logo=anthropic&logoColor=white)](https://claude.ai/download)
[![Cursor](https://img.shields.io/badge/-Cursor%20IDE-000000?style=flat-square&logo=cursor&logoColor=white)](https://cursor.sh/)
[![Node.js](https://img.shields.io/badge/-Node.js%20%2F%20npx-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Nível](https://img.shields.io/badge/Nível-Intermediário-blue?style=flat-square)](.)

---

## 📋 Índice

- [O que é o bmcp-n8n](#-o-que-é-o-bmcp-n8n)
- [Como o MCP funciona neste contexto](#-como-o-mcp-funciona-neste-contexto)
- [Pré-requisitos](#-pré-requisitos)
- [Variáveis de Configuração](#-variáveis-de-configuração)
- [1. Claude Desktop App](#1-claude-desktop-app)
- [2. Claude Code (CLI / Terminal)](#2-claude-code-cli--terminal)
- [3. VS Code / Cursor IDE](#3-vs-code--cursor-ide)
- [Segurança — Nunca commite as chaves](#-segurança--nunca-commite-as-chaves)
- [Testando a Integração](#-testando-a-integração)
- [Referência Rápida](#-referência-rápida)
- [Troubleshooting](#-troubleshooting)
- [Sobre o Autor](#-sobre-o-autor)

---

## 🧩 O que é o bmcp-n8n

O **bmcp-n8n** é um servidor MCP (Model Context Protocol) remoto que expõe workflows e automações do **n8n** como **ferramentas diretamente invocáveis por LLMs** — Claude, Cursor ou qualquer cliente compatível com MCP.

Na prática: você descreve o que quer em linguagem natural e o Claude aciona o workflow correto no n8n sem precisar de webhook manual, botão ou interface intermediária.

```
Você no Chat/Terminal
        │
        │  "Execute o workflow de qualificação de leads
        │   com esse CPF: 123.456.789-00"
        ▼
  Claude (LLM) — decide qual tool usar
        │
        │  → chama bmcp-n8n via MCP Protocol
        ▼
  bmcp-n8n Server (remoto)
        │
        │  → autentica com X-MCP-KEY
        │  → chama a API do n8n com X-N8N-API-KEY
        ▼
  n8n — executa o workflow
        │
        ▼
  Resultado retorna ao Claude → responde para você
```

---

## 🔗 Como o MCP funciona neste contexto

O **Model Context Protocol (MCP)** é um protocolo aberto da Anthropic que padroniza como agentes de IA se conectam a ferramentas externas. Em vez de cada integração ter sua própria forma de autenticação e comunicação, o MCP define um contrato único:

- O **servidor MCP** (bmcp-n8n) expõe ferramentas com nome, descrição e schema de parâmetros
- O **cliente MCP** (Claude Desktop, Claude Code, Cursor) descobre as ferramentas disponíveis ao conectar
- O **LLM** decide quando e como invocar cada ferramenta com base no contexto da conversa

O transporte usado aqui é **HTTP remoto via `mcp-remote`** — o cliente local se conecta ao servidor remoto usando `npx mcp-remote@latest`, com autenticação via headers HTTP customizados (`X-MCP-KEY`, `X-N8N-URL`, `X-N8N-API-KEY`).

---

## ✅ Pré-requisitos

| Requisito | Observação |
|---|---|
| **Node.js** instalado | Necessário para o `npx` funcionar; versão 18+ recomendada |
| **bmcp-n8n** implantado e acessível via URL pública | Servidor MCP remoto do n8n em execução |
| **n8n** com API habilitada | API Key gerada em `Configurações → API` no painel do n8n |
| **Token MCP** (`X-MCP-KEY`) | Chave de acesso ao servidor bmcp-n8n |
| Um dos ambientes: Claude Desktop, Claude Code ou Cursor | Pelo menos um cliente MCP compatível |

---

## 🔑 Variáveis de Configuração

Antes de configurar qualquer ambiente, tenha estas três informações em mãos:

| Variável | Onde obter | Exemplo |
|---|---|---|
| `SUA_URL_DO_BMCP` | URL do servidor bmcp-n8n em produção | `https://mcp.seudominio.com.br` |
| `SEU_TOKEN_DE_ACESSO_MCP` | Token configurado no bmcp-n8n | `mcp_abc123xyz...` |
| `SUA_URL_DO_N8N` | URL pública da instância n8n | `https://n8n.seudominio.com.br` |
| `SUA_CHAVE_API_DO_N8N` | n8n → Settings → API → Create API Key | `n8n_api_xyz789...` |

> 🔴 **Nunca coloque esses valores diretamente em arquivos versionados.** Veja a seção [Segurança](#-segurança--nunca-commite-as-chaves).

---

## 1. Claude Desktop App

O Claude Desktop carrega os servidores MCP a partir de um arquivo de configuração JSON global, lido toda vez que o app é iniciado.

### Localizar o arquivo de configuração

| Sistema Operacional | Caminho |
|---|---|
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |

> 💡 Se o arquivo não existir, crie-o com exatamente esse nome nessa pasta. O Claude Desktop o detecta automaticamente no próximo início.

### Estrutura do arquivo

```json
{
  "mcpServers": {
    "bmcp-n8n": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://SUA_URL_DO_BMCP/mcp",
        "--header",
        "X-MCP-KEY:SEU_TOKEN_DE_ACESSO_MCP",
        "--header",
        "X-N8N-URL:https://SUA_URL_DO_N8N",
        "--header",
        "X-N8N-API-KEY:SUA_CHAVE_API_DO_N8N"
      ]
    }
  }
}
```

> ℹ️ Se você já tem outros servidores MCP configurados, adicione `"bmcp-n8n"` como mais uma chave dentro do objeto `"mcpServers"` existente — não substitua o arquivo inteiro.

### Validar a conexão

1. **Feche completamente** o Claude Desktop (bandeja do sistema → botão direito → Sair)
2. Reabra o app
3. No canto inferior direito da caixa de chat, aparece um ícone de **ferramentas (🔧)** ou **plug**
4. Clique nele — o `bmcp-n8n` deve aparecer listado com status verde e as ferramentas disponíveis expostas

> ⚠️ Se o ícone não aparecer ou o servidor não conectar, verifique se o `npx` está acessível no `PATH` do sistema. Abra um terminal e rode `npx --version` para confirmar.

---

## 2. Claude Code (CLI / Terminal)

O Claude Code (ferramenta de terminal da Anthropic) usa uma combinação de configuração global — que define políticas de confiança — com arquivos `.mcp.json` por projeto.

### Passo 1 — Configuração global de confiança

Para evitar prompts de autorização repetitivos a cada troca de projeto, configure a permissão global:

Abra ou crie `~/.claude/settings.json` e adicione:

```json
{
  "enableAllProjectMcpServers": true
}
```

> 💡 Essa configuração instrui o Claude Code a confiar automaticamente em servidores MCP declarados em `.mcp.json` dentro de projetos, sem pedir confirmação manual a cada sessão.

### Passo 2 — Criar `.mcp.json` na raiz do projeto

Na raiz do repositório onde o Claude Code deve interagir com o n8n, crie o arquivo `.mcp.json`:

```json
{
  "mcpServers": {
    "bmcp-n8n": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://SUA_URL_DO_BMCP/mcp",
        "--header",
        "X-MCP-KEY:SEU_TOKEN_DE_ACESSO_MCP",
        "--header",
        "X-N8N-URL:https://SUA_URL_DO_N8N",
        "--header",
        "X-N8N-API-KEY:SUA_CHAVE_API_DO_N8N"
      ]
    }
  }
}
```

> 🔴 Adicione `.mcp.json` ao `.gitignore` do projeto se o arquivo contiver credenciais reais. Veja a seção [Segurança](#-segurança--nunca-commite-as-chaves) para a abordagem recomendada com variáveis de ambiente.

### Passo 3 — Executar e verificar

```bash
# Na pasta do projeto
claude
```

Dentro do ambiente do Claude Code, execute o diagnóstico:

```
/mcp
```

O terminal lista todos os servidores MCP ativos. O `bmcp-n8n` deve aparecer com status conectado e a quantidade de ferramentas/workflows disponíveis.

---

## 3. VS Code / Cursor IDE

O Cursor tem suporte nativo a MCP. O VS Code suporta via extensão oficial da Anthropic. Ambos aceitam configuração global (para todos os projetos) ou por workspace (isolada por repositório).

### Opção A — Configuração Global (Cursor)

1. Abra as configurações: `Ctrl + ,` (Windows/Linux) ou `Cmd + ,` (macOS)
2. Acesse **Features → MCP**
3. Clique em **+ Add New MCP Server**
4. Preencha os campos:

| Campo | Valor |
|---|---|
| **Name** | `bmcp-n8n` |
| **Type** | `command` |
| **Command** | `npx -y mcp-remote@latest https://SUA_URL_DO_BMCP/mcp --header "X-MCP-KEY:SEU_TOKEN_DE_ACESSO_MCP" --header "X-N8N-URL:https://SUA_URL_DO_N8N" --header "X-N8N-API-KEY:SUA_CHAVE_API_DO_N8N"` |

> 💡 A configuração global persiste entre projetos e sessões — ideal para quem usa bmcp-n8n em múltiplos repositórios sem querer reconfigurar a cada um.

### Opção B — Configuração por Projeto (`.mcp.json`)

Para manter as configurações isoladas por repositório — útil quando cada projeto aponta para uma instância n8n diferente ou tem seu próprio token MCP:

1. Certifique-se de que a flag global está ativa no `settings.json` do editor:
   ```json
   {
     "enableAllProjectMcpServers": true
   }
   ```

2. Crie `.mcp.json` na raiz do workspace com a mesma estrutura do [Passo 2 da seção Claude Code](#passo-2--criar-mcp-json-na-raiz-do-projeto)

3. Abra o **Chat ou Composer** (`Ctrl + I` / `Cmd + I`) e teste a integração:
   ```
   Liste os workflows disponíveis no meu n8n.
   ```

O Cursor vai invocar o bmcp-n8n via MCP, retornar a lista de workflows ativos e expô-los como ferramentas para uso imediato na conversa.

---

## 🔒 Segurança — Nunca commite as chaves

As credenciais nos arquivos de configuração (`X-MCP-KEY`, `X-N8N-API-KEY`) são equivalentes a senhas — se vazarem em um repositório público, qualquer pessoa pode acionar seus workflows.

### Boas práticas

**`.gitignore` imediato:**
```
# MCP config com credenciais
.mcp.json
claude_desktop_config.json
```

**Abordagem recomendada para times:** use um `.mcp.json.example` versionado com os marcadores de posição, e um `.mcp.json` real no `.gitignore`:

```json
// .mcp.json.example — este arquivo É versionado
{
  "mcpServers": {
    "bmcp-n8n": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://SUA_URL_DO_BMCP/mcp",
        "--header",
        "X-MCP-KEY:SEU_TOKEN_AQUI",
        "--header",
        "X-N8N-URL:https://SUA_URL_DO_N8N",
        "--header",
        "X-N8N-API-KEY:SUA_CHAVE_AQUI"
      ]
    }
  }
}
```

```bash
# .gitignore — este arquivo É versionado
.mcp.json          # contém credenciais reais, nunca commitar
```

**Para o `claude_desktop_config.json` no Windows:** o arquivo fica em `%APPDATA%\Claude\`, fora de qualquer repositório Git — risco menor, mas evite backups automáticos na nuvem (OneDrive, Google Drive) sem criptografia.

---

## 🧪 Testando a Integração

Após configurar qualquer um dos três ambientes, valide que o bmcp-n8n está funcionando corretamente:

### Teste 1 — Listar ferramentas disponíveis

No Claude Desktop ou Cursor Chat:
```
Quais ferramentas do n8n estão disponíveis para você?
```

O Claude deve retornar a lista de workflows expostos pelo bmcp-n8n como ferramentas MCP.

### Teste 2 — Executar um workflow simples

```
Execute o workflow [nome do workflow] com os parâmetros [parâmetros].
```

### Teste 3 — Claude Code CLI

```bash
claude
# Dentro do ambiente:
/mcp
```

A saída deve mostrar `bmcp-n8n` como servidor conectado com o número de ferramentas ativas.

### Sinais de que algo está errado

| Sintoma | Provável causa |
|---|---|
| Ícone de ferramentas não aparece no Claude Desktop | Arquivo `claude_desktop_config.json` com erro de sintaxe JSON ou `npx` fora do PATH |
| Servidor aparece mas não conecta | URL do bmcp-n8n inacessível ou token inválido |
| Claude diz que não tem ferramentas | `.mcp.json` não encontrado na raiz do projeto ou `enableAllProjectMcpServers` não configurado |
| Timeout na conexão | Servidor bmcp-n8n offline ou firewall bloqueando a porta |

---

## ⚡ Referência Rápida

### Estrutura JSON (todos os ambientes usam a mesma)

```json
{
  "mcpServers": {
    "bmcp-n8n": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://SUA_URL_DO_BMCP/mcp",
        "--header",
        "X-MCP-KEY:SEU_TOKEN_DE_ACESSO_MCP",
        "--header",
        "X-N8N-URL:https://SUA_URL_DO_N8N",
        "--header",
        "X-N8N-API-KEY:SUA_CHAVE_API_DO_N8N"
      ]
    }
  }
}
```

### Onde o arquivo vai em cada ambiente

| Ambiente | Arquivo | Localização |
|---|---|---|
| Claude Desktop (Windows) | `claude_desktop_config.json` | `%APPDATA%\Claude\` |
| Claude Desktop (macOS) | `claude_desktop_config.json` | `~/Library/Application Support/Claude/` |
| Claude Code | `.mcp.json` | Raiz do projeto |
| Cursor (global) | Interface gráfica | `Ctrl+,` → Features → MCP |
| Cursor (por projeto) | `.mcp.json` | Raiz do workspace |
| VS Code + extensão Anthropic | `.mcp.json` | Raiz do workspace |

### Comando de diagnóstico (Claude Code CLI)

```bash
claude      # inicia o ambiente
/mcp        # lista servidores ativos e ferramentas expostas
```

---

## 🐛 Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| `npx: command not found` | Node.js não instalado ou fora do PATH | Instale o Node.js 18+ e reinicie o terminal/app |
| Servidor não aparece no Claude Desktop após reiniciar | Erro de sintaxe no JSON do `claude_desktop_config.json` | Valide o JSON em [jsonlint.com](https://jsonlint.com) antes de salvar |
| `mcp-remote` falha com erro de SSL | Certificado SSL inválido na URL do bmcp-n8n | Confirme que o servidor tem HTTPS com certificado válido (Let's Encrypt via Traefik, por exemplo) |
| Claude invoca a ferramenta mas n8n retorna erro 401 | `X-N8N-API-KEY` inválida ou expirada | Gere uma nova API Key no painel do n8n em Settings → API |
| Claude invoca a ferramenta mas bmcp retorna 403 | `X-MCP-KEY` incorreta | Verifique o token no servidor bmcp-n8n e atualize o arquivo de configuração |
| Cursor não detecta `.mcp.json` do projeto | `enableAllProjectMcpServers` não configurado | Adicione `"enableAllProjectMcpServers": true` ao `settings.json` global do Cursor |
| Múltiplos servidores MCP, conflito de nomes | Dois servidores com a chave `"bmcp-n8n"` no mesmo arquivo | Renomeie um deles (ex: `"bmcp-n8n-producao"` e `"bmcp-n8n-staging"`) |
| Configuração funcionava e parou sem mudança | Sessão do `mcp-remote` expirou ou servidor reiniciou | Reinicie o Claude Desktop ou rode `claude` novamente no terminal |

---

## 👤 Sobre o Autor

<table>
<tr>
<td width="120">
<a href="https://bru.ia.br/">
<img src="https://bru.ia.br/001_repo_external/og-image.webp" width="100" alt="Bruno Goulart"/>
</a>
</td>
<td>

**Bruno Goulart** — AI Automation Specialist & Full Stack Developer

Uno a robustez de 18+ anos de código escrito na raça e forjado no braço à inteligência de LLMs, ferramentas hype de automação, DevOps e arquitetura full-stack — do MVP ao deploy em produção.

Especialista em MCP Servers, AI Agents (LangChain, LangGraph), automação n8n e integração de LLMs em produtos reais.

🔗 **[bru.ia.br](https://bru.ia.br/)**

</td>
</tr>
</table>

---

## 📜 Licença

MIT — use, adapte e distribua livremente, mantendo os créditos de autoria.
