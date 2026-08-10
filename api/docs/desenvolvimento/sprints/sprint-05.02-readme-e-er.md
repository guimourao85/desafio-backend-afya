# Sprint 05.02 — README do avaliador e ER (F7 de PLAN.md §13)

> Sumário:
>
> - §objetivo — o que esta sprint entrega e por quê
> - §decisoes — o que foi decidido na execução, com rationale
> - §nomes — identificadores fixados antes de codar
> - §escopo — plano ordenado por dependência
> - §edge-cases — os casos não-óbvios
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS, por agente
> - §issues — o que apareceu durante a implementação
> - §riscos — situacional: a sprint publica credencial de demonstração
>
> **Plano canônico:** [PLAN.md §13 — F7](../../PLAN.md) · **Contrato do README:** [PLAN.md §15](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Criado em:** 2026-08-10 · **Fase:** F7
**Status:** ⬜ não iniciada
**Agentes acionados:** `[Seguranca]` `[Produto]` `[QA]`

> **Dependência:** o roteiro de avaliação (`PLAN.md §15` item 4) termina em "anotar →
> ver a linha do tempo" sobre a base do seed, que nasce na **sprint 05.01**. Os passos
> 1, 2, 5, 6 e 7 do §escopo são independentes; os passos 3, 4 e 9 esperam a 05.01.
> É a última fase de feature do roadmap: depois dela só resta a 06.01.

---

<!-- §objetivo -->

## Objetivo

Esta sprint fecha o entregável para quem vai **julgar** o projeto. Até aqui o
repositório funciona; depois dela ele se **explica sozinho** — um clone limpo, os
comandos de subida, e um roteiro de seis passos que leva o avaliador do login à linha
do tempo sem que ele precise abrir um arquivo de código para descobrir o que fazer.

É a única sprint em que o artefato entregue é **prosa**, e em que o teste é uma
pessoa seguindo instruções. Não há código de aplicação, não há schema, não há regra
de negócio: há um contrato — o `PLAN.md §15` — e a conferência de que cada linha dele
existe e funciona.

**Módulos impactados:** nenhum. `RAIZ README.md`, mais uma correção de contagem em
`docs/PLAN.md §16.3` (passo 7).

**Risco principal se falhar:** é a única sprint cujo defeito o avaliador enxerga
**antes** de qualquer virtude do código. README que manda rodar um comando que não
existe custa mais do que qualquer decisão de arquitetura ganha — e o defeito não
aparece para quem escreveu, só para quem clonou.

**Agentes obrigatórios e por qual gatilho** ([CLAUDE.md §Ativação](../../../../CLAUDE.md)):

| Agente        | Gatilho                                                                          | Fora do limite? |
| ------------- | ---------------------------------------------------------------------------------- | --------------- |
| `[Seguranca]` | varredura de segredo comitado (F7 item 4) + credencial demo em destaque no README   | sim             |
| `[QA]`        | F7 fecha fase — e é a **última** fase de feature (`PLAN.md §13`)                    | sim             |
| `[Produto]`   | o README **é** o contrato com o avaliador; `PLAN.md §15` é o critério                | não (1 de 1)    |

> **`[Backend]`, `[Database]` e `[Dominio]` não entram.** Não há código, schema,
> entity nem regra de negócio. O ER é **desenho do que já existe** — se desenhá-lo
> revelar divergência com o banco real, isso é `[DEVOLVE]` e `[Database]` entra fora
> do limite (edge case 2).

**Fora do escopo desta sprint:**

| Fora                                                              | Onde vai                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Pipeline de CI (GitHub Actions)**                                 | **Cortado — não vai a lugar nenhum** (decisão 6)                             |
| Teste de concorrência no slot, idempotência e carga                 | sprint 06.01 (rigor)                                                         |
| Deploy, cloud, ambiente de produção                                 | ADR-12 — fora do escopo do projeto, por decisão                              |
| Reescrever `api/README.md` (documento de arquitetura)               | já existe e já cumpre o papel — o README raiz **aponta**, não repete (decisão 3) |
| Reescrever o ledger de débitos em prosa mais legível                | pendência conhecida do usuário, sem fase                                     |

<!-- /§objetivo -->

---

<!-- §decisoes -->

## Decisões de execução

| # | Decisão                                    | Escolha                                                                                                                                           | Rationale                                                                                                                                                                       | Alternativa descartada                                                                            |
| - | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1 | Como o README declara o estado do projeto  | Por uma **tabela RF/RNF × onde está** (§15 item 5) e um ponteiro para `PRODUCT.md §roadmap`. Nenhum bloco de estado narrado em prosa               | Estado narrado envelhece a cada sprint e envelhece em silêncio. Requisito não envelhece, porque o requisito não muda — o que muda é a coluna "onde está"                          | Um aviso "F6 concluída" atualizado a cada fase — mesmo defeito, adiado uma sprint                   |
| 2 | Onde ficam os números que mudam            | **Um lugar só, e nunca no topo**: contagem de teste vive na seção de testes; contagem de rota vive no roteiro. Zero repetição                      | Número repetido em N lugares é N chances de mentir e uma chance de acertar. O topo é o pior lugar: é o que se lê primeiro e o que menos se revisita                                | Repetir os números onde ajudam a vender o projeto — que é como um README passa a mentir três vezes  |
| 3 | Onde mora o roteiro de 6 passos            | **README raiz**, seção própria, imediatamente após as credenciais do seed                                                                          | É o único conteúdo que o avaliador lê em ordem, do começo ao fim. Enterrá-lo depois de "Comandos" é enterrar o entregável                                                          | Arquivo `AVALIACAO.md` separado — mais um clique entre a pessoa e o produto                          |
| 4 | Duplicação com `api/README.md`             | **README raiz não repete arquitetura**: aponta. O diagrama do §15 item 7 é o **ER** (item 8), não um segundo diagrama de camadas                   | Regra de fonte única (`CLAUDE.md §Documentação`). `api/README.md` já é o dono de camadas, DI, contrato de erro, persistência e teste                                               | Um diagrama de camadas no raiz — bonito, e drift garantido em duas cópias                            |
| 5 | Onde mora o ER e de onde ele é lido        | **README raiz**, Mermaid inline, gerado **lendo as quatro migrations aplicadas** — nunca as entities                                               | A migration é o que está no banco; a entity é o que alguém quis. Divergência entre as duas é achado (edge case 2), e ler a fonte errada esconde exatamente isso                    | Ler as entities (mais fácil); ou gerar por ferramenta e comitar imagem — binário que ninguém revisa  |
| 6 | **Pipeline de CI (F7 item 3, RNF-12)**     | **Cortado. Sem débito, sem ponteiro, sem menção no README** além da linha da tabela de requisitos                                                  | RNF-12 é **Desejável** (`PLAN.md:89`), não obrigatório, e o corte já está declarado em `PLAN.md §3.1`. Pipeline que ninguém vai manter numa POC avaliada localmente é cerimônia    | Entregar o CI mesmo assim; ou cortar e registrar `DEBT-NN` — as duas recusadas pelo usuário          |
| 7 | Quais débitos entram no README             | Todos os **ALTO**, mais os que o avaliador **encontra executando o roteiro**. Uma linha cada, com link para o ledger, que continua sendo o dono    | §15 item 9 pede "resumidos". Catorze débitos por extenso viram um segundo documento dentro do README; só os ALTO deixaria de fora o que a pessoa vai ver com os próprios olhos     | Copiar a tabela inteira (duplicação que a fonte única proíbe); ou só os ALTO (esconde o que se vê)   |
| 8 | Fonte das contagens de ADR e de débito     | **`PRODUCT.md §adrs` e `DEBITOS-TECNICOS.md §abertos`** — nunca o resumo de `PLAN.md §16.3`, que é corrigido no passo 7                            | Resumo não é fonte. §16.3 é ponteiro por decisão do próprio documento, e ponteiro com número dentro é drift esperando ser copiado                                                  | Ler o §16.3, que está à mão e é mais curto                                                          |

> Nenhuma destas decisões muda arquitetura, agregado ou contrato — **não há ADR nesta
> sprint**, e nenhuma nasce como débito.

<!-- /§decisoes -->

---

<!-- §nomes -->

## Nomes fixados

| Tipo  | Nome                        | Onde             | Descrição                                                   |
| ----- | --------------------------- | ---------------- | ------------------------------------------------------------ |
| Seção | `## Credenciais`            | `RAIZ README.md` | Email e senha do seed em destaque, com a nota de dev-only    |
| Seção | `## Roteiro de avaliação`   | `RAIZ README.md` | Os 6 passos do `PLAN.md §15` item 4 (decisão 3)              |
| Seção | `## Requisitos atendidos`   | `RAIZ README.md` | Tabela RF/RNF × onde está (decisão 1)                        |
| Seção | `## Modelagem`              | `RAIZ README.md` | ER em Mermaid, lido das migrations (decisão 5)               |
| Seção | `## Decisões e limites`     | `RAIZ README.md` | 13 ADRs + os débitos da decisão 7                            |

**Os 6 passos do roteiro** — fixados aqui para que a fricção PRÉ os discuta antes de
serem escritos em prosa:

| # | Passo                                                                         | O que o avaliador vê                       |
| - | ------------------------------------------------------------------------------- | ------------------------------------------ |
| 1 | `POST /api/auth/login` no `/api/docs`, com a credencial da seção `## Credenciais` | `accessToken` e `refreshToken`             |
| 2 | **Authorize** com o `accessToken`                                              | o cadeado fecha; as rotas protegidas abrem |
| 3 | `POST /api/patients`                                                          | RF-01 — paciente criado (201)              |
| 4 | `POST /api/appointments` para esse paciente                                   | RF-03 — consulta marcada (201)             |
| 5 | `POST /api/appointments` de novo, **no mesmo instante**                       | **409** `SCHEDULE_CONFLICT` — INV-01       |
| 6 | `POST /api/appointments/:id/notes` → `GET /api/patients/:id/appointments`     | RF-05 e RF-06 — anotação e linha do tempo  |

**Tabelas do ER** (as cinco das quatro migrations, com as cinco FKs nomeadas):
`doctors` · `refresh_tokens` · `patients` · `appointments` · `consultation_notes`.

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

**Ordem importa.** `RAIZ` = raiz do repositório.

| # | Ação   | Arquivo                                                                                          | Tipo  | Depende de | Espera a 05.01? |
| - | ------ | -------------------------------------------------------------------------------------------------- | ----- | ---------- | --------------- |
| 1 | Editar | `RAIZ README.md` — remover o bloco de estado narrado e o placeholder de F7; nenhuma menção a pipeline (decisões 1, 2 e 6) | ALTER | — | não |
| 2 | Editar | `RAIZ README.md` — `## Requisitos atendidos`, com RNF-12 marcado **fora de escopo**                 | ALTER | 1          | não             |
| 3 | Editar | `RAIZ README.md` — `## Credenciais` em destaque                                                     | ALTER | 1          | **sim**         |
| 4 | Editar | `RAIZ README.md` — `## Roteiro de avaliação` nos 6 passos do §nomes                                 | ALTER | 3          | **sim**         |
| 5 | Editar | `RAIZ README.md` — `## Modelagem` com o ER em Mermaid, lido das quatro migrations                   | ALTER | 1          | não             |
| 6 | Editar | `RAIZ README.md` — `## Decisões e limites` (13 ADRs + os débitos da decisão 7)                      | ALTER | 1          | não             |
| 7 | Editar | `docs/PLAN.md §16.3` — a contagem de débitos abertos, contra `DEBITOS-TECNICOS.md §abertos` (decisão 8) | ALTER | — | não |
| 8 | Rodar  | varredura F7 item 4: `TODO`, `console.log`, segredo comitado, `git log` legível                     | —     | —          | não             |
| 9 | Manual | **Clone limpo em diretório novo** → seguir o README palavra por palavra até a linha do tempo        | —     | 1-8        | **sim**         |

### Migrations

**Nenhuma.** Esta sprint não toca schema nem código. O ER **lê** as migrations; não as
altera.

<!-- /§escopo -->

---

<!-- §edge-cases -->

## Edge cases

| # | Caso                                                                | Comportamento esperado                                                                                        | Coberto por          |
| - | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1 | README manda rodar comando que não existe ou mudou de nome          | Reprovado no passo 9 (clone limpo). É o único teste real desta sprint                                           | passo 9 do §escopo   |
| 2 | **ER desenhado diverge do schema real do banco**                    | `[DEVOLVE]` — para, `[Database]` entra fora do limite. Não se "ajusta o desenho"                                | decisão 5            |
| 3 | Avaliador roda `npm run seed` duas vezes seguindo o README          | Sai limpo, sem duplicar — garantido pela 05.01. O README **não** avisa para rodar uma vez só                    | dependência da 05.01 |
| 4 | Varredura de segredo acusa `prontomed123` do `.env.example`         | **Falso positivo aceito e documentado** — credencial dev-only, e o seed recusa fora de `APP_ENV=dev`            | §riscos              |
| 5 | `git log` com commit ilegível ou fora do padrão                     | Conferir, e **não** reescrever histórico já comitado                                                            | passo 8 do §escopo   |
| 6 | Tabela de RF/RNF marca RNF-12 como atendido                         | **Errado.** RNF-12 é Desejável e foi **cortado** (decisão 6) — a tabela diz isso, sem eufemismo                  | passo 2 do §escopo   |
| 7 | ER em Mermaid não renderiza no GitHub (sintaxe ou bloco errado)     | Conferir no GitHub renderizado, não no editor local                                                             | passo 5 + revisão    |
| 8 | Débito que o avaliador encontra no roteiro não está no README       | O resumo perde o propósito: vira lista de virtudes. A decisão 7 é a regra, e o passo 9 é quem a testa            | decisão 7 + passo 9  |
| 9 | Número no README que a próxima sprint invalida                      | Não deve existir fora do lugar único que a decisão 2 fixa — é o defeito que a decisão 1 e a 2 existem para matar  | decisão 2 + checklist |

<!-- /§edge-cases -->

---

<!-- §checklist -->

## Checklist anti-erro (pré-fechamento)

**Verde**

- [ ] `npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e` — todos verdes
- [ ] "Pronto quando" de F7 satisfeito literalmente: clone limpo → `docker compose up -d` → `migration:run && seed` → `/api/docs` executa **todos** os fluxos

**README (contrato de `PLAN.md §15`)**

- [ ] Os 9 itens do §15 presentes, na ordem de quem acabou de clonar
- [ ] Todo comando do README **executado à mão**, na ordem, em clone limpo
- [ ] Credenciais do seed em destaque, com a nota de dev-only
- [ ] Roteiro nos 6 passos do §nomes, incluindo o 409 do passo 5
- [ ] Zero repetição de `PLAN.md`, de `api/README.md` ou de DDD explicado (regra de fonte única)
- [ ] ER em Mermaid renderiza **no GitHub** e bate com as **migrations aplicadas**
- [ ] RNF-12 aparece na tabela como **fora de escopo**, não como pendência nem como débito
- [ ] Nenhum bloco de estado narrado; nenhum número repetido em dois lugares (decisões 1 e 2)
- [ ] ADRs e débitos conferidos contra `PRODUCT.md §adrs` e `DEBITOS-TECNICOS.md §abertos`, não contra `PLAN.md §16.3`

**Segurança e higiene**

- [ ] Varredura: zero `TODO`, zero `console.log`, zero segredo comitado
- [ ] `.env` fora do git; `.env.example` só com placeholder
- [ ] `git log` legível de ponta a ponta
- [ ] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [ ] Docs: `PRODUCT.md §roadmap` (estado 05.02) · `PLAN.md §16.3` corrigido (passo 7)

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente        | Fase | Score | Severidade máxima | Observação |
| ------------- | ---- | ----- | ----------------- | ---------- |
| `[Produto]`   | PRÉ  | /10   |                   |            |
| `[Seguranca]` | PRÉ  | /10   |                   |            |
| `[Produto]`   | PÓS  | /10   |                   |            |
| `[QA]`        | PÓS  | /10   |                   |            |

**Conflitos entre agentes e como foram resolvidos:**

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| - | ---------- | ---------- | ------- | -------- | ----- |
|   |            |            |         |          |       |

<!-- /§issues -->

---

<!-- §riscos -->

## Riscos e mitigações

| Risco                                                     | Impacto                                                             | Mitigação                                                                            | Sinal de que aconteceu                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| README com comando que não funciona no clone limpo        | O avaliador trava no passo 3 e nada do resto do projeto é visto      | Passo 9 do §escopo: executar o README palavra por palavra em diretório novo               | Qualquer passo do roteiro exigindo improviso              |
| Credencial demo lida como vazamento                       | Falso positivo em varredura, ou pânico do avaliador                  | Destacar **com** a explicação de dev-only e do guard `APP_ENV=dev`                        | `[Seguranca]` levantando `prontomed123` como CRÍTICO      |
| ER desenhado a partir das entities, não das migrations    | Diagrama que descreve a intenção, não o banco — mentira sofisticada  | Decisão 5 + edge case 2: divergência é `[DEVOLVE]`, não ajuste de desenho                 | ER "bate" com as entities mas alguma FK não existe no SQL |
| Corte do CI lido como esquecimento pelo avaliador         | Parece lacuna, não escolha                                           | Tabela de requisitos marca RNF-12 como **fora de escopo, Desejável** — uma linha           | Avaliador perguntando "cadê o pipeline?"                  |
| README voltar a envelhecer depois desta sprint            | O defeito que esta sprint corrige volta na sprint seguinte           | Decisões 1 e 2 tiram o que envelhece; o checklist de fechamento já cobra o README de toda sprint que muda o que o avaliador vê | Qualquer número novo aparecendo fora do lugar único |

<!-- /§riscos -->
