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
> - §passo-9 — a validação de ponta a ponta, com método e limites
> - §riscos — situacional: a sprint publica credencial de demonstração
>
> **Plano canônico:** [PLAN.md §13 — F7](../../PLAN.md) · **Contrato do README:** [PLAN.md §15](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Criado em:** 2026-08-10 · **Fase:** F7
**Status:** ✅ **fechada em 10/08/2026** — os 10 passos do §escopo entregues, fricção PÓS
feita (um ALTO do `[Produto]` corrigido) e o **passo 9 executado duas vezes**: sobre
snapshot do futuro commit, antes do push, e de novo **a partir de um `git clone` real
de `origin/main`** depois dele (§passo-9). A fricção PRÉ havia corrigido três ALTO e
quatro MÉDIO no doc antes da primeira linha de prosa (§scores).
**Agentes acionados:** `[Seguranca]` `[Produto]` `[QA]`

> **Dependência 1 — a 05.01:** ✅ **fechada em 10/08/2026.** O roteiro roda sobre a
> base do seed (3 pacientes, 3 consultas, 2 anotações) e sobre o Swagger com exemplo
> de corpo em toda rota. Isso **muda o roteiro**, e o `§nomes` foi reescrito por
> causa disso na fricção PRÉ.
>
> **Dependência 2 — o commit, que a PRÉ tratou como bloqueio do passo 9.**
> Em 10/08/2026 `origin/main` está no commit da 04.02, com 65 arquivos fora do git: um
> `git clone` traria um repositório **sem seed, sem exemplos de corpo e sem os
> decorators de erro**, e o README desta sprint descreveria um sistema que o clone não
> tem. **Resolvido sem quebrar a regra do `CLAUDE.md §Git`:** o passo 9 rodou sobre um
> snapshot fiel do futuro commit, sem `git commit` e sem `push` (decisão 10 revista,
> §passo-9). Segue dependendo do push apenas o `git clone` real e o render do Mermaid.
>
> **O repositório é público** (confirmado pelo usuário em 10/08/2026), então o
> `git clone` do passo 1 do README funciona para o avaliador.
>
> **`RAIZ README.md` foi editado em paralelo** por outra sessão do usuário (título e
> formatação de tabelas, em 10/08/2026) — o arquivo foi relido antes de cada edição e
> nada do que estava lá foi revertido.
>
> É a última fase de feature do roadmap: depois dela só resta a 06.01.

---

<!-- §objetivo -->

## Objetivo

Esta sprint fecha o entregável para quem vai **julgar** o projeto. Até aqui o
repositório funciona; depois dela ele se **explica sozinho** — um clone limpo, os
comandos de subida, e um roteiro que leva o avaliador do login à anonimização LGPD
sem que ele precise abrir um arquivo de código para descobrir o que fazer.

É a única sprint em que o artefato entregue é **prosa**, e em que o teste é uma
pessoa seguindo instruções. Não há código de aplicação, não há schema, não há regra
de negócio: há um contrato — o `PLAN.md §15` — e a conferência de que cada linha dele
existe e funciona.

**Módulos impactados:** nenhum. `RAIZ README.md`, mais duas correções em `docs/PLAN.md`:
a contagem de débitos do `§16.3` (passo 7) e os itens 4 e 7 do `§15`, que passam a
descrever o que esta sprint entrega (passo 7', decisões 3 e 4).

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
| 3 | Onde mora o roteiro, e de quantos passos    | **README raiz**, seção própria, logo após `## Credenciais`. **Dez passos em cinco atos**, não seis — decisão do usuário na fricção PRÉ de 10/08/2026 | É o único conteúdo que o avaliador lê em ordem, do começo ao fim. Enterrá-lo depois de "Comandos" é enterrar o entregável. **Os seis passos originais (`PLAN.md §15` item 4) omitiam RF-08 e o slot que volta** — a anonimização que preserva histórico é item que `PLAN.md §3.1` nomeia entre "o que o prisma nunca corta", e mostrar o 409 sem mostrar o cancelamento liberando o horário demonstra INV-01 pela metade | Arquivo `AVALIACAO.md` separado — mais um clique entre a pessoa e o produto; ou os seis passos, que deixam o requisito protegido pelo prisma fora do único texto lido em ordem |
| 4 | Duplicação com `api/README.md`, e o item 7 do `§15` | **README raiz não repete arquitetura**: ganha **cinco linhas** (camadas, agregados, DI do Nest) e o ponteiro para `api/README.md`. **Sem** segundo diagrama — o único diagrama do raiz é o ER do item 8 | Regra de fonte única (`CLAUDE.md §Documentação`): `api/README.md` é dono de camadas, DI, contrato de erro, persistência e teste. **Corrigido na fricção PRÉ (ALTO do `[Produto]`):** este campo dizia que "o diagrama do item 7 **é** o ER do item 8" — e os dois são itens distintos do `§15`, então o checklist "os 9 itens presentes" reprovaria a própria sprint. O `§15` item 7 é corrigido junto (passo 7'), porque quem manda no contrato é o `PLAN.md` e ele precisa dizer o que vai ser feito | Um diagrama de camadas no raiz — bonito, e drift garantido em duas cópias; ou o item 7 virar ponteiro puro, que tira do avaliador o resumo na primeira leitura |
| 5 | Onde mora o ER e de onde ele é lido        | **README raiz**, Mermaid inline, gerado **lendo as quatro migrations aplicadas** — nunca as entities                                               | A migration é o que está no banco; a entity é o que alguém quis. Divergência entre as duas é achado (edge case 2), e ler a fonte errada esconde exatamente isso                    | Ler as entities (mais fácil); ou gerar por ferramenta e comitar imagem — binário que ninguém revisa  |
| 6 | **Pipeline de CI (F7 item 3, RNF-12)**     | **Cortado. Sem débito, sem ponteiro, sem menção no README** além da linha da tabela de requisitos                                                  | RNF-12 é **Desejável** (`PLAN.md:89`), não obrigatório, e o corte já está declarado em `PLAN.md §3.1`. Pipeline que ninguém vai manter numa POC avaliada localmente é cerimônia    | Entregar o CI mesmo assim; ou cortar e registrar `DEBT-NN` — as duas recusadas pelo usuário          |
| 7 | Quais débitos entram no README             | Todos os **ALTO** (hoje: DEBT-01 e DEBT-07), mais os que o avaliador **encontra executando o roteiro** — **conjunto a fechar na fricção PRÉ**, com candidatos já nomeados: DEBT-02 (dois horários a 30 min um do outro são aceitos — sobreposição por duração) e DEBT-05 (reenviar o mesmo `POST` duplica o recurso). "Encontra executando" sem lista nominal não é critério que contexto limpo consiga aplicar (auditoria de 10/08). Uma linha cada, com link para o ledger, que continua sendo o dono    | §15 item 9 pede "resumidos". Catorze débitos por extenso viram um segundo documento dentro do README; só os ALTO deixaria de fora o que a pessoa vai ver com os próprios olhos     | Copiar a tabela inteira (duplicação que a fonte única proíbe); ou só os ALTO (esconde o que se vê)   |
| 8 | Fonte das contagens de ADR e de débito     | **`PRODUCT.md §adrs` e `DEBITOS-TECNICOS.md §abertos`** — nunca o resumo de `PLAN.md §16.3`, que é corrigido no passo 7                            | Resumo não é fonte. §16.3 é ponteiro por decisão do próprio documento, e ponteiro com número dentro é drift esperando ser copiado                                                  | Ler o §16.3, que está à mão e é mais curto                                                          |

| 9 | Onde mora a credencial do seed             | **`## Credenciais` é o dono único.** A nota do passo 7 da tabela "Subir" vira ponteiro; o exemplo do login no Swagger (05.01) é o terceiro lugar e **fica**, porque lá ela é executável, não documental | Achado MÉDIO do `[Produto]` na PRÉ: sem isto a credencial passaria a existir em três lugares, que é exatamente o drift que a decisão 2 existe para matar. Um lugar **descreve**, outro **executa** — a duplicação que sobra é funcional, e está declarada | Repetir o par email/senha nas três; ou tirar do Swagger, que devolveria o 401 no primeiro Execute que a 05.01 acabou de resolver |
| 10 | Quando o passo 9 (clone limpo) é executável | **Revista na execução, a pedido do usuário.** A PRÉ decidiu "só depois da 05.01 comitada e publicada"; na execução o passo rodou sobre um **snapshot do índice + working tree** (`GIT_INDEX_FILE` temporário → `git write-tree` → `git archive`), que é byte a byte o que o commit conterá, sem commit e sem push (§passo-9) | O motivo do bloqueio era não testar o README contra um repositório que não o tem — e o snapshot resolve isso. A alternativa descartada na PRÉ era `git archive` do **working tree**, que ignora o `.gitignore` e o índice: o snapshot não tem esse defeito, e foi ele que **pegou** o índice defasado (§issues 6). O que continua exigindo o push é o `git clone` real e o render do Mermaid | Esperar o commit para validar qualquer coisa — que deixaria a sprint fechar sem nenhum teste do próprio artefato |
| 11 | `§15` item 2 promete "**Subir em 3 comandos**" e a tabela tem 8 passos | **A tabela fica; o `§15` item 2 é reescrito** (passo 7') para "os três comandos que sobem a aplicação — `up -d`, `migration:run`, `seed` — dentro da tabela do clone à validação" | Os três **comandos** já são exatamente esses; os outros cinco passos são clonar, entrar, copiar `.env`, conferir o `/health` e abrir o Swagger — não são comandos de subida, são o entorno. Comprimir a tabela para caber na frase esconderia o `cp api/.env.example api/.env`, sem o qual nada sobe. **Decisão minha na fricção PRÉ, reversível:** se preferir a tabela em três linhas com o resto em prosa, é trocar este campo | Comprimir a tabela; ou deixar a divergência, que faz o checklist "os 9 itens do §15" passar por um item que o texto não cumpre |

> Nenhuma destas decisões muda arquitetura, agregado ou contrato — **não há ADR nesta
> sprint**, e nenhuma nasce como débito. As decisões 3, 4, 9 e 10 nasceram **na
> fricção PRÉ**, contra o repositório real; as demais vieram da abertura.

<!-- /§decisoes -->

---

<!-- §nomes -->

## Nomes fixados

| Tipo  | Nome                        | Onde             | Descrição                                                   |
| ----- | --------------------------- | ---------------- | ------------------------------------------------------------ |
| Seção | `## Credenciais`            | `RAIZ README.md` | Email e senha do seed em destaque, com a nota de dev-only — **dono único** (decisão 9) |
| Seção | `## Roteiro de avaliação`   | `RAIZ README.md` | Os 10 passos em 5 atos (decisão 3)                           |
| Seção | `## Requisitos atendidos`   | `RAIZ README.md` | Tabela RF/RNF × onde está (decisão 1)                        |
| Seção | `## Arquitetura`            | `RAIZ README.md` | Cinco linhas + ponteiro para `api/README.md`, sem diagrama (decisão 4) |
| Seção | `## Modelagem`              | `RAIZ README.md` | ER em Mermaid, lido das migrations (decisão 5)               |
| Seção | `## Decisões e limites`     | `RAIZ README.md` | 13 ADRs + os débitos da decisão 7                            |

**Mapa `PLAN.md §15` → seção**, para que o `§checklist` ("os 9 itens presentes") seja
conferível por quem chegar de contexto limpo:

| Item do §15 | Onde fica | Estado ao fim da sprint |
| --- | --- | --- |
| 1 · O que é, em três linhas | abertura do README | ✅ já existia, intacto |
| 2 · Do clone à validação | `## Do clone à validação` | ✅ tabela mantida em 8 passos; quem se corrigiu foi o `§15` (decisão 11, passo 7') |
| 3 · Credenciais em destaque | `## Credenciais` | ✅ novo — dono único do par (decisão 9) |
| 4 · Roteiro de avaliação | `## Roteiro de avaliação` | ✅ novo — 10 passos em 5 atos (decisão 3) |
| 5 · Requisitos RF/RNF | `## Requisitos atendidos` | ✅ novo — RF-01 a RF-08 e RNF-01 a RNF-12, com os dois "fora de escopo" nomeados |
| 6 · Como rodar os testes | `## Testes` | ✅ já existia; virou o **dono único** das contagens |
| 7 · Arquitetura | `## Arquitetura` | ✅ novo — cinco linhas + ponteiro, sem diagrama (decisão 4) |
| 8 · Modelagem (ER) | `## Modelagem` | ✅ novo — Mermaid lido das 4 migrations |
| 9 · Decisões e limites | `## Decisões e limites` | ✅ novo — 13 ADRs + 4 débitos (decisão 7) |

**Os 10 passos do roteiro, em 5 atos** — fixados aqui antes de virarem prosa. Cada
ato responde uma pergunta do avaliador; a base do seed (05.01) já está no banco, e os
passos 3 a 5 criam dados **próprios** para que ele veja a criação acontecer, não só o
resultado pronto:

| Ato | # | Passo | O que o avaliador vê |
| --- | - | ----- | -------------------- |
| **Entrar** | 1 | `POST /api/auth/login` no `/api/docs` — a credencial **já vem preenchida** no exemplo | `accessToken` e `refreshToken` |
|            | 2 | **Authorize** com o `accessToken` → `GET /api/auth/me` | o cadeado fecha e a identidade sai do token (INV-04) |
| **Paciente** | 3 | `POST /api/patients` | RF-01 — paciente criado (201) |
|              | 4 | `GET /api/patients` | RF-02 — os três do seed **mais** o recém-criado, paginados |
| **Agenda** | 5 | `POST /api/appointments` para esse paciente | RF-03 — consulta marcada (201) |
|            | 6 | `POST /api/appointments` de novo, **no mesmo instante** | **409** `SCHEDULE_CONFLICT` — INV-01 |
|            | 7 | `DELETE /api/appointments/:id` → `POST` de novo **no mesmo horário** | 204 e **201**: cancelar devolve o slot. Sem este passo, INV-01 fica pela metade |
| **Consulta** | 8 | `POST /api/appointments/:id/notes` | RF-05 — anotação criada (201) |
|              | 9 | `GET /api/patients/:id/appointments` | RF-06 — linha do tempo, consultas do mais recente para trás |
| **LGPD** | 10 | `DELETE /api/patients/:id` → repetir o passo 9 | 204, PII apagada, **histórico intacto** — RF-08, que `PLAN.md §3.1` protege |

> **Cobre 9 das 17 rotas.** As oito restantes — `health`, `refresh`, `logout`,
> `GET /patients/:id`, `PATCH /patients/:id`, `GET /appointments`,
> `GET /appointments/:id`, `PATCH /appointments/:id` — ficam fora **por prisma**, não
> por esquecimento: cada uma está no Swagger, com exemplo, e nenhuma acrescenta
> requisito que os dez passos já não demonstrem.

**Tabelas do ER** (as cinco das quatro migrations, com as cinco FKs nomeadas):
`doctors` · `refresh_tokens` · `patients` · `appointments` · `consultation_notes`.

<!-- /§nomes -->

---

<!-- §escopo -->

## Escopo — plano ordenado

**Ordem importa.** `RAIZ` = raiz do repositório.

| # | Ação   | Arquivo                                                                                          | Tipo  | Depende de | Espera a 05.01? |
| - | ------ | -------------------------------------------------------------------------------------------------- | ----- | ---------- | --------------- |
| 1 | Editar | `RAIZ README.md` — remover o bloco de estado narrado (`> **Estado: 🚧 F6 concluída…**`) e o placeholder de F7; nenhuma menção a pipeline (decisões 1, 2 e 6). **Concreto a resolver aqui:** as contagens de teste (133 / 153) aparecem hoje em **três** lugares — bloco de estado, tabela "Validar" (passos 12 e 14) e tabela de `## Testes`. Sai o bloco; das outras duas, **`## Testes` é o dono** e a tabela "Validar" passa a não citar número | ALTER | — | não |
| 2 | Editar | `RAIZ README.md` — `## Requisitos atendidos`, com RNF-12 marcado **fora de escopo**                 | ALTER | 1          | não             |
| 3 | Editar | `RAIZ README.md` — `## Credenciais` em destaque; a nota do passo 7 vira ponteiro (decisão 9)         | ALTER | 1          | **sim**         |
| 4 | Editar | `RAIZ README.md` — `## Roteiro de avaliação` nos **10 passos / 5 atos** do §nomes                    | ALTER | 3          | **sim**         |
| 4'| Editar | `RAIZ README.md` — `## Arquitetura`: cinco linhas + ponteiro, sem diagrama (decisão 4)               | ALTER | 1          | não             |
| 5 | Editar | `RAIZ README.md` — `## Modelagem` com o ER em Mermaid, lido das quatro migrations                   | ALTER | 1          | não             |
| 6 | Editar | `RAIZ README.md` — `## Decisões e limites` (13 ADRs + os débitos da decisão 7)                      | ALTER | 1          | não             |
| 7 | Editar | `docs/PLAN.md §16.3` — a contagem de débitos abertos, contra `DEBITOS-TECNICOS.md §abertos` (decisão 8) | ALTER | — | não |
| 7'| Editar | `docs/PLAN.md §15` — item 4 passa a descrever os **10 passos** (decisão 3) e o item 7, **cinco linhas + ponteiro, sem diagrama** (decisão 4). O contrato tem de dizer o que vai ser entregue | ALTER | — | não |
| 8 | Rodar  | varredura F7 item 4, comandos fixados: `grep -rn TODO api/src api/test` · `grep -rn console.log api/src` · `git ls-files .env` (saída vazia = `.env` fora do git) · `git log --oneline` de ponta a ponta; `prontomed123` no `.env.example` é falso positivo **aceito** (§riscos)                     | —     | —          | não             |
| 9 | Manual | **Ambiente do zero em diretório novo** → seguir o README palavra por palavra até o passo 10 do roteiro. Executado em 10/08/2026 sobre snapshot fiel do futuro commit (decisão 10 revista) — registro completo em **§passo-9** | — | 1-8 | não (método revisto) |
| 10 | Editar | `api/docs/PRODUCT.md §roadmap` — estado da 05.02 para ✅; e este sub-doc (`§scores` PÓS, `§issues`) | ALTER | 9 | não |

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
| 10 | Avaliador segue o roteiro numa base que **já tem** 3 pacientes e 3 consultas | Esperado, e o texto diz isso: os passos 3 a 5 criam dados **próprios** para mostrar a criação acontecendo. O `GET` do passo 4 devolve os do seed **mais** o novo, e é assim que se vê a paginação com conteúdo real | §nomes (roteiro) + seed da 05.01 |
| 11 | Passo 7 do roteiro (cancelar e reagendar) executado sobre uma consulta **do seed** | Funciona — cancelar devolve o slot para qualquer consulta viva. O roteiro manda usar **a criada no passo 5**, para o avaliador não desfazer o estado de demonstração que ele ainda vai usar no passo 9 | §nomes (roteiro) |
| 12 | Passo 10 (anonimizar) executado sobre um paciente **do seed** | Funciona, e **estraga o estado**: Pedro anonimizado não volta, e quem reabrir o README depois encontra a base diferente da que ele descreve. O roteiro manda anonimizar **o paciente criado no passo 3** | §nomes (roteiro) + decisão 3 |

<!-- /§edge-cases -->

---

<!-- §checklist -->

## Checklist anti-erro (pré-fechamento)

**Verde**

- [x] `npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e` — todos verdes (133 unitários / 21 suítes · 153 e2e / 10 suítes, 10/08/2026), no repositório de trabalho **e** no ambiente do zero
- [x] "Pronto quando" de F7 satisfeito literalmente: ambiente do zero → `docker compose up -d` → `migration:run && seed` → `/api/docs` executa **todos** os fluxos (§passo-9)

**README (contrato de `PLAN.md §15`)**

- [x] Os 9 itens do §15 presentes, na ordem de quem acabou de clonar — conferidos **pelo mapa do §nomes**, item a item
- [x] Todo comando do README **executado à mão**, na ordem, em ambiente do zero (§passo-9)
- [x] Credenciais do seed em destaque, com a nota de dev-only — e em **um lugar só** no texto (decisão 9)
- [x] Roteiro nos **10 passos / 5 atos** do §nomes: o 409 (passo 6), o slot que volta (passo 7) e a LGPD com histórico intacto (passo 10)
- [x] Zero repetição de `PLAN.md`, de `api/README.md` ou de DDD explicado (regra de fonte única)
- [x] ER em Mermaid bate com as **migrations aplicadas** (lido delas, não das entities) e **renderiza**: SVG gerado com `mermaid@11` a partir do README do clone real, com as 5 tabelas e os 5 relacionamentos; no GitHub o bloco é reconhecido como diagrama (edge case 7)
- [x] RNF-12 aparece na tabela como **fora de escopo**, não como pendência nem como débito
- [x] Nenhum bloco de estado narrado; nenhum número repetido em dois lugares (decisões 1 e 2) — três repetições encontradas e removidas na PÓS
- [x] ADRs e débitos conferidos contra `PRODUCT.md §adrs` e `DEBITOS-TECNICOS.md §abertos`, não contra `PLAN.md §16.3`

**Segurança e higiene**

- [x] Varredura: zero `TODO`, zero `console.log`, zero segredo comitado (os cinco `prontomed123` são a credencial dev-only aceita — §riscos)
- [x] `.env` fora do git; `.env.example` só com placeholder
- [x] `git log` legível de ponta a ponta — dois commits fora do padrão, **não** reescritos (§issues 3)
- [x] Scores ≥ 9/10 na fricção PÓS (`[Produto]` 9 · `[Seguranca]` 9 · `[QA]` 10); zero CRÍTICO e zero ALTO em aberto
- [x] Docs: `PRODUCT.md §roadmap` (estado 05.02) · `PLAN.md §16.3` corrigido (passo 7) · `PLAN.md §15` itens 2, 4 e 7 alinhados ao que foi entregue (passo 7')

<!-- /§checklist -->

---

<!-- §scores -->

## Scores de fricção

| Agente        | Fase | Score | Severidade máxima | Observação |
| ------------- | ---- | ----- | ----------------- | ---------- |
| `[Produto]`   | PRÉ  | **9/10** (7/10 antes da correção) | **ALTO (3), resolvidos no doc** | (1) O roteiro de seis passos **não mostrava RF-08**, que `PLAN.md §3.1` nomeia entre "o que o prisma nunca corta", nem o slot voltando depois do cancelamento — INV-01 demonstrada pela metade no único texto que o avaliador lê em ordem → decisão 3, dez passos em cinco atos (escolha do usuário). (2) A decisão 4 fundia os itens **7 e 8** do `§15`, que são distintos: o checklist "os 9 itens presentes" reprovaria a própria sprint → cinco linhas + ponteiro, e o `§15` corrigido junto (passo 7'). (3) O passo 9 (clone limpo) era **inexecutável**: `origin/main` está no commit da 04.02 e 65 arquivos estão fora do git → decisão 10, pré-condição declarada. MÉDIO (3): o roteiro foi escrito **antes** da 05.01 e ignorava que a base já nasce populada (edge cases 10 a 12); `§15` item 2 promete "3 comandos" e a tabela tem 8 passos (issue do passo 1); a credencial passaria a viver em três lugares → decisão 9. BAIXO (2): faltava passo para `PRODUCT.md §roadmap` (passo 10) e o mapa `§15` → seção, sem o qual o checklist não é conferível. **Premissas factuais verificadas e corretas:** 13 ADRs, 14 débitos abertos, 2 ALTO (DEBT-14 está em §resolvidos), 5 tabelas e 5 FKs no banco, `§16.3` de fato desatualizado |
| `[Seguranca]` | PRÉ  | **9/10** | MÉDIO (1), resolvido no doc | Confirmado sem achado: `.env` fora do git (`git ls-files api/.env` vazio), `.env.example` só com placeholder, seed fail-closed por `APP_ENV`, nenhum segredo novo nesta sprint, nenhuma rota. **MÉDIO:** o `§riscos` e o passo 8 tratavam `prontomed123` como falso positivo **do `.env.example`** — e desde a 05.01 ele também aparece no `/api/docs-json`, no exemplo do login. Varredura da F7 encontraria num lugar que o doc não previu → aceite ampliado para os dois lugares. Sobre publicar a credencial em destaque no README: **é o objetivo**, não risco — o que a torna aceitável é o guard de ambiente, e o texto tem de dizer isso na mesma linha |
| `[Produto]`   | PÓS  | **9/10** | **ALTO (1), corrigido** | **ALTO:** o passo 6 do roteiro afirmava que o 409 vem do banco — "é o banco que recusa, não um `if`". **Falso no caminho que o avaliador percorre:** pelo Swagger, em sequência, quem responde é a checagem do caso de uso (`schedule-appointment.service.ts:82,89-92` — o próprio comentário do código diz "Esta aqui é a que dá o 409"); o índice parcial é a **segunda** camada, a que fecha a corrida. O README venderia a garantia mais forte no lugar errado, e um avaliador que abrisse o service veria a doc mentindo sobre o código. Corrigido no roteiro (parágrafo "Sobre o 409 do passo 6", que agora explica as duas camadas e aponta para o que ainda não foi provado) e em `## Modelagem`. MÉDIO (2): RF-02 e RF-04 mandavam para "passo 4"/"passo 7" rotas que o roteiro **não** percorre (`PATCH`, `GET :id`) — a tabela virou "no passo N; as demais no Swagger"; e "3 pacientes, 3 consultas, 2 anotações" ficou em **três** lugares (pegadinha 7, roteiro, tabela de scripts), exatamente o que a decisão 2 proíbe — a pegadinha 7 ficou dona. BAIXO (2): "os passos 12 a 14 da **tabela acima**" deixou de resolver depois da reordenação das seções → link nomeado; e a palavra "Treze" antes da tabela de ADRs, que é contagem duplicada da própria tabela |
| `[Seguranca]` | PÓS  | **9/10** | MÉDIO (1), aceite ampliado | Varredura da F7 item 4 executada: **zero** `TODO`/`FIXME`, **zero** `console.log` (`grep -rn` em `api/src` e `api/test`), `.env` fora do git (`git ls-files` sem match), `git log` legível de ponta a ponta. Publicar a credencial em `## Credenciais` é o objetivo da sprint, e o texto declara o guard `APP_ENV=dev` na **mesma frase** — não numa nota de rodapé. **MÉDIO:** `prontomed123` está em **cinco** lugares versionados, não nos dois que o §riscos previa — `.env.example`, `PLAN.md:1756` (apêndice do `.env.example`), `environment.spec.ts:18` (fixture de teste), `authenticate-doctor.controller.ts:51` (exemplo do Swagger, que vira `/api/docs-json`) e agora o `README.md`. Todos são a mesma credencial dev-only atrás do mesmo guard fail-closed; nenhum é segredo real. Aceite ampliado de novo, agora com a lista fechada (§riscos) |
| `[QA]`        | PÓS  | **10/10** | zero em aberto | Gates verdes no repositório de trabalho **e** no ambiente do zero. **O passo 9 foi executado** (ver §passo-9): 14 passos do README + 10 do roteiro + edge case 3, tudo em `/home/guilh/projects/tmp/desafio-backend-afya`, com container e volume criados do nada. Contagens do README confirmadas contra a execução: **133 / 21 suítes** e **153 / 10 suítes**, **17 rotas** no `/api/docs-json`. ER: sintaxe validada com o **parser do próprio Mermaid v11**, mesma major que o GitHub renderiza — o **render visual** é o único item que segue dependendo do push (edge case 7) |

**Conflitos entre agentes e como foram resolvidos:**

Nenhum entre agentes. Houve **um entre o doc e o contrato** (ALTO 2): `PLAN.md §15`
item 7 pede "arquitetura em um diagrama e cinco linhas" no README raiz, e a decisão 4
recusava repetir arquitetura. Não se resolve por hierarquia — o `PLAN.md` é o dono do
contrato e estava pedindo o que a regra de fonte única desaconselha. Decidido pelo
usuário em 10/08/2026: **cinco linhas + ponteiro, sem diagrama**, e o `§15` é corrigido
para dizer isso. Mesmo precedente da 05.01: quem se corrige é o documento, não a
entrega — com a diferença de que lá o código venceu a doc, e aqui a decisão venceu o
contrato, que passa a registrá-la.

> **O que a PRÉ pegou e por que ela existe.** Os três ALTO têm a mesma raiz: o doc foi
> escrito **antes da 05.01 fechar** e raciocinou sobre um repositório que já não é
> este. O roteiro nasceu para uma base vazia, o item 7 foi lido como se o ER o
> satisfizesse, e o passo 9 pressupunha um `origin` que tivesse o código. Nenhum dos
> três apareceria antes de escrever a prosa — e depois seriam três reescritas da única
> seção que o avaliador lê em ordem.

<!-- /§scores -->

---

<!-- §issues -->

## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| - | ---------- | ---------- | ------- | -------- | ----- |
| 1 | O README atribuía o 409 do passo 6 ao **banco**. No caminho sequencial do Swagger quem responde é a **checagem do caso de uso** | Escrever sobre a garantia mais forte (o índice parcial) em vez da que o avaliador de fato exercita. As duas existem; a ordem é que estava trocada | Parágrafo "Sobre o 409 do passo 6" explicando as duas camadas e o que a segunda ainda não provou; mesma correção em `## Modelagem` | `README.md` | correção na PÓS (`[Produto]` ALTO) |
| 2 | `prontomed123` está em **cinco** arquivos versionados, não nos dois que a PRÉ mapeou | A PRÉ mapeou os dois lugares "de produto" (`.env.example` e Swagger) e não varreu doc nem fixture de teste | Aceite ampliado com a lista fechada no §riscos. Nenhuma remoção: os cinco são a mesma credencial dev-only atrás do guard `APP_ENV=dev` | `§riscos` deste doc | aceite documentado (`[Seguranca]` MÉDIO) |
| 3 | Dois commits fora do padrão no histórico: `docs: Atualização Readme principal` e `docs: Atualização documentação` (maiúscula, PT-BR, sem `Solucao:`) | Commits feitos fora do fluxo da governança, antes da convenção estar estabilizada | **Nada.** Edge case 5 é explícito: conferir e **não** reescrever histórico já comitado. Registrado para que a varredura da F7 não seja lida como aprovação silenciosa | — | registro (edge case 5) |
| 4 | A contagem de débitos do `PLAN.md §16.3` estava em **11 (DEBT-01 … DEBT-11)**; são **14** | O resumo foi escrito quando havia 11 e nunca acompanhou o ledger — exatamente o drift que a decisão 8 prevê | Corrigido para "14 abertos (DEBT-01 a DEBT-13 e DEBT-15 — o DEBT-14 está em §resolvidos)" | `PLAN.md §16.3` | passo 7 do §escopo |
| 5 | Validar o Mermaid sem publicar: o Playwright do ambiente não tem Chromium instalado | Ferramenta indisponível, não defeito do artefato | Parser do `mermaid@11` rodado direto em Node (`mermaid.parse`), mesma major que o GitHub usa. Valida **sintaxe**; o render visual continua dependendo do push (edge case 7) | — | verificação parcial, declarada no `[QA]` |
| 6 | **O índice do git estava defasado.** `git status --porcelain` acusava `MM` em `README.md`, `PLAN.md`, `PRODUCT.md` e neste sub-doc: staged na versão **anterior** à sprint | Os 65 arquivos foram adicionados ao índice antes das edições de hoje; `git add` não reflete edição posterior | Descoberto porque o primeiro snapshot do passo 9 veio com o README **antigo**. **Nada foi comitado nem re-adicionado** (regra do `CLAUDE.md §Git`) — o snapshot passou a ser gerado com índice temporário (`GIT_INDEX_FILE`), e o usuário foi avisado de que precisa de `git add` antes do commit | — | aviso ao usuário |
| 7 | A linha do tempo do passo 9 traz **duas** consultas no mesmo horário: a cancelada no passo 7 e a que nasceu no lugar dela | Comportamento correto (cancelar tira o horário da unicidade, não do histórico) e não documentado — o avaliador leria como duplicata | Parágrafo novo no roteiro: "O que isso faz aparecer no passo 9" | `README.md` | correção vinda do passo 9 |
| 8 | **(pós-fechamento, 10/08)** O Swagger pré-preenchia `search="pedro"` em `GET /api/patients`: o passo 4 executado ao pé da letra devolvia `total: 1`, não "seed + o seu" | O passo 9 desta sprint validou por HTTP reconstruído, não clicando na UI — o prefill do example só aparece no fluxo Try it out → Execute | Removido o `example` do `@ApiQuery` de `search` (a busca segue documentada na descrição). Detectado por validação Playwright dirigindo o Swagger real | `list-patients.controller.ts` | correção pós-fechamento (ACHADO-01) |
| 9 | **(pós-fechamento, 10/08)** O texto do passo 10 prometia a anonimização visível "no mesmo `GET`" da timeline — mas a timeline não devolve bloco do paciente | O texto foi escrito da intenção (RF-08 inteiro num lugar só), não da resposta real da rota; a validação por HTTP olhou a ficha, não conferiu a promessa do texto | Passo 10 reescrito: timeline prova o histórico intacto, `GET /api/patients/:id` mostra a PII apagada — e o porquê de a timeline não expor dado pessoal | `README.md` | correção pós-fechamento (ACHADO-02) |
| 10 | **(pós-fechamento, 10/08)** A mensagem do `401 INVALID_REFRESH_TOKEN` — "Sessão expirada. Faça login novamente." — afirma uma causa que pode não ser a real. O usuário colou o accessToken no refresh e concluiu que a API tinha quebrado | O texto da decisão 21 da sprint 02.02 nomeou a causa mais comum; a resposta única anti-oráculo (correta) ficou com um texto que mente nos outros casos | Mensagem trocada por "Refresh token inválido ou sessão expirada. Faça login novamente." — segue **uma** resposta para todas as causas, sem oráculo; e2e e `PRODUCT.md §regras` acompanharam | `refresh-session.service.ts` · `refresh-session.controller.ts` · `authentication.e2e-spec.ts` · `PRODUCT.md` | correção pós-fechamento (ACHADO-03) |
| 11 | **(pós-fechamento, 10/08)** A validação Playwright que achou as issues 8–10 vivia em scratchpad — evaporaria no reboot, e o avaliador não veria que o roteiro é provado por máquina | O registro "Playwright é ferramenta, não entregável" valia para dumps de sessão do MCP; o **script de validação** é outra categoria — decisão do usuário: versionar | `api/test/roteiro-mcp-playwright/` com o script comentado, README próprio e deps isoladas (não polui `api/package.json`); ponteiro na seção do roteiro do README principal. Fora do perímetro de jest/lint/tsc por extensão e testRegex; `**/node_modules` no `.dockerignore` para o build não engolir as deps da ferramenta | `api/test/roteiro-mcp-playwright/*` · `README.md` · `api/.dockerignore` | entregável novo |

<!-- /§issues -->

---

<!-- §passo-9 -->

## Passo 9 — a validação de ponta a ponta

Executado em 10/08/2026, a pedido do usuário, em `/home/guilh/projects/tmp/desafio-backend-afya`.

**O método, e por que ele não é o `git clone` literal.** `origin/main` está em `dd190c9`
(04.02): clonar do GitHub testaria o README da sprint passada. Como `git commit` é do
usuário, o clone foi **reproduzido a partir do que o commit conteria** — índice
temporário (`GIT_INDEX_FILE`) + `git read-tree HEAD` + `git add -A` + `git write-tree` +
`git archive`. O resultado respeita `.gitignore` byte a byte, sem commit, sem push e
**sem tocar no índice do usuário** (confirmado: os 4 `MM` seguiam lá depois). Saíram
**178 arquivos** — sem `node_modules`, sem `.env`, sem `referencia_tecnica/`.

Ambiente do zero: `docker compose down` no projeto de trabalho, volume novo
(`desafio-backend-afya_pgdata`), banco vazio.

| Etapa | Resultado |
| --- | --- |
| Passos 3 a 8 do README (`cp .env`, `up -d`, `/api/health`, `migration:run`, `seed`, `/api/docs`) | todos ✅ — `{"status":"ok"}`, 4 migrations aplicadas, médico + 3 pacientes + 3 consultas, `/api/docs` 200 e **17 rotas** no `docs-json` |
| Roteiro, passos 1 e 2 | 200 com `accessToken`/`refreshToken` (credencial **já preenchida** no exemplo) · `me` devolve `Dra. Helena Prado` |
| Roteiro, passos 3 e 4 | 201 · `GET /patients` com `total: 4` — os 3 do seed **mais** o criado, como o texto promete |
| Roteiro, passos 5, 6 e 7 | 201 · **409 `SCHEDULE_CONFLICT`** · 204 e depois **201 no mesmo horário** — o slot volta |
| Roteiro, passos 8, 9 e 10 | 201 · timeline com as consultas e a anotação · 204 e, depois de anonimizar, **nome `Paciente anonimizado`, `phone`/`email`/`birthDate` nulos e o histórico inteiro de pé** |
| Edge case 3 (seed duas vezes) | `credencial reconfirmada, nada mais inserido` — nada duplicado |
| Passos 9 a 14 do README | `lint` · `typecheck` · `build` ✅ · **133/21** unitários · `migration:run:test` ✅ · **153/10** e2e |
| Pegadinha 9 do README ("o e2e nunca toca o banco de desenvolvimento") | confirmada: depois da suíte inteira, o banco de dev seguia com os 4 pacientes e as 5 consultas do roteiro |

**Duas correções nasceram daqui:** o índice defasado (§issues 6) e a consulta cancelada
aparecendo na linha do tempo (§issues 7).

### A segunda rodada — `git clone` de verdade

Depois do push (`759880b`), a validação foi **refeita do começo**, agora sem nenhuma
simulação: `projects/tmp` esvaziado, volume `desafio-backend-afya_pgdata` removido, e
`git clone https://github.com/guimourao85/desafio-backend-afya.git` — o comando exato do
passo 1 do README, copiado dele.

| Etapa | Resultado no clone real |
| --- | --- |
| O que veio | **178 arquivos**, sem `.env`, sem `node_modules`, README com as 11 seções |
| Passos 3 a 8 | `.env` copiado · compose de pé · `{"status":"ok"}` na 2ª tentativa · volume novo com **`prontomed` e `prontomed_test`** criados pelo `init-test-db.sh` (pegadinha 4) · **4 migrations** · seed com médico, 3 pacientes e 3 consultas · `/api/docs` 200 com **17 rotas** |
| Roteiro, 10 passos | todos verdes: 200 · 200 · 201 · `total: 4` · 201 · **409 `SCHEDULE_CONFLICT`** · 204 + **201 no mesmo horário** · 201 · timeline com a anotação · 204 e `Paciente anonimizado` com `phone`/`email`/`birthDate` nulos e **as 2 consultas e a anotação de pé** |
| Edge case 3 | `credencial reconfirmada, nada mais inserido` |
| Passos 9 a 14 | lint · typecheck · build ✅ · **133/21** · 4 migrations no banco de teste · **153/10** |
| Pegadinha 9 | banco de dev intacto depois da suíte: 4 pacientes, 5 consultas |
| ER em Mermaid | **renderizado de fato** com `mermaid@11` sobre o README do clone: SVG de 108 KB, as 5 tabelas, os 5 relacionamentos rotulados, as colunas — sem `Syntax error`. Na página do repositório, o bloco vem marcado como `data-type="mermaid"` e sem `Unable to render` |

**O último item, o que dependia de olho humano:** a aparência do diagrama na página
renderizada do GitHub — **conferida pelo usuário em 10/08/2026, aprovada**. Nada da
sprint segue sem verificação.

<!-- /§passo-9 -->

---

<!-- §riscos -->

## Riscos e mitigações

| Risco                                                     | Impacto                                                             | Mitigação                                                                            | Sinal de que aconteceu                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| README com comando que não funciona no clone limpo        | O avaliador trava no passo 3 e nada do resto do projeto é visto      | Passo 9 do §escopo: executar o README palavra por palavra em diretório novo               | Qualquer passo do roteiro exigindo improviso              |
| Credencial demo lida como vazamento                       | Falso positivo em varredura, ou pânico do avaliador                  | Destacar **com** a explicação de dev-only e do guard `APP_ENV=dev`, na mesma frase. **Aceite fechado na fricção PÓS** — `prontomed123` está em **cinco** lugares versionados, e a varredura acha nos cinco: `api/.env.example` (fonte) · `PLAN.md:1756` (apêndice do `.env.example`) · `environment.spec.ts:18` (fixture) · `authenticate-doctor.controller.ts:51` (exemplo do Swagger → `/api/docs-json`) · `README.md §Credenciais`. A PRÉ previa dois; nenhum dos três a mais é segredo novo | `[Seguranca]` levantando `prontomed123` como CRÍTICO      |
| ER desenhado a partir das entities, não das migrations    | Diagrama que descreve a intenção, não o banco — mentira sofisticada  | Decisão 5 + edge case 2: divergência é `[DEVOLVE]`, não ajuste de desenho                 | ER "bate" com as entities mas alguma FK não existe no SQL |
| Corte do CI lido como esquecimento pelo avaliador         | Parece lacuna, não escolha                                           | Tabela de requisitos marca RNF-12 como **fora de escopo, Desejável** — uma linha           | Avaliador perguntando "cadê o pipeline?"                  |
| README voltar a envelhecer depois desta sprint            | O defeito que esta sprint corrige volta na sprint seguinte           | Decisões 1 e 2 tiram o que envelhece; o checklist de fechamento já cobra o README de toda sprint que muda o que o avaliador vê | Qualquer número novo aparecendo fora do lugar único |

<!-- /§riscos -->
