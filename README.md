# Cisco CME Tool

Ferramenta de inventário para Cisco Call Manager Express (CME) versão 1.0.

Este projeto converte um backup/configuração CME em uma lista de ramais criada a partir de seções `voice register` e `ephone`.

## Recursos

- Parser CLI (`cisco_cme_inventory.py`) para gerar saída em `table`, `json` ou `csv`
- Interface web local (`cisco_cme_inventory_ui.html`) com:
  - upload de arquivo de backup
  - pesquisa por número de ramal ou nome
  - ordenação por ID, número de ramal ou nome
  - exportação CSV/JSON
- Reconhecimento de estruturas CME:
  - `voice register dn`
  - `voice register pool`
  - `ephone-dn`
  - `ephone`
- Associação entre `voice register dn` e `voice register pool` para recuperar `modelo` e `MAC`

## Instalação

1. Abra este diretório no terminal.
2. Garanta que Python 3 esteja disponível para rodar o parser CLI.
3. Abra `cisco_cme_inventory_ui.html` no navegador para usar a interface.

## Uso CLI

```bash
python cisco_cme_inventory.py backup.cfg
```

Opções:

- `-f table|json|csv` — define o formato de saída (padrão: `table`)
- `-o output-file` — salva a saída em um arquivo quando usar `json` ou `csv`

Exemplos:

```bash
python cisco_cme_inventory.py sample-backup.cfg
python cisco_cme_inventory.py sample-backup.cfg -f json -o inventario.json
python cisco_cme_inventory.py sample-backup.cfg -f csv -o inventario.csv
```

## Uso da interface web

1. Abra `cisco_cme_inventory_ui.html` no navegador.
2. Selecione o arquivo de backup CME (`.cfg`, `.txt`, etc.).
3. Use a pesquisa para filtrar por número de ramal ou nome.
4. Use o seletor de ordenação para ordenar por `ID`, `Número Ramal` ou `Nome`.
5. Exporte o inventário para CSV ou JSON.

## Formato suportado

O parser reconhece as principais estruturas:

- `voice register pool <id>`
- `voice register dn <id>`
- `ephone-dn <id>`
- `ephone <id>`

Os campos extraídos incluem:

- `number`
- `source` (`voice register` ou `ephone`)
- `id`
- `name`
- `label`
- `type`
- `model`
- `mac`
- `pool` (associação de `voice register dn` ao pool)
- `pool_status` (`ok`, `missing pool`, `missing pool id`)
- `description`

A associação entre `voice register dn` e `voice register pool` é feita pelo mesmo ID quando não há um campo `pool` explícito no bloco `voice register dn`.

## Arquivos principais

- `cisco_cme_inventory.py` — parser e gerador de inventário CLI
- `cisco_cme_inventory_ui.html` — interface web de upload e visualização
- `app.js` — lógica do parser/filtragem/ordenção no navegador
- `styles.css` — estilo da interface
- `.github/agents/Admin-CiscoCme-Skill.agent.md` — agente customizado com conhecimento de CME 3.0

## Versão 1.0

Primeira versão funcional do projeto, com suporte básico para inventário de ramais CME e visualização local.
