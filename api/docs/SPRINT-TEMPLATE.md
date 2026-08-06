# SPRINT-TEMPLATE.md — Formato do sub-doc de sprint

> Sumário:
> - §principio — o que o sprint-doc guarda que o `PLAN.md §13` não guarda, e o preço disso
> - §nomeacao — como o arquivo se chama e como ele se amarra à fase
> - §corpo — o bloco a copiar ao abrir uma sprint (7 seções fixas + 2 situacionais)
> - §preenchimento — as regras que fazem a diferença entre registro e ritual
>
> **Autoridade:** este documento manda no **formato**. O **conteúdo canônico** de
> cada fase (entrega, passos, critério de pronto, commits) mora em
> [PLAN.md §13](PLAN.md). O de-para sprint ↔ fase mora em
> [PRODUCT.md §roadmap](PRODUCT.md). Divergiu? **`PLAN.md §13` vence.**

---

<!-- §principio -->
## Princípio

O `PLAN.md §13` já diz **o que** cada fase entrega e **quando** ela está pronta.
O sprint-doc existe para o que o plano não consegue guardar, porque só aparece na
execução:

| O sprint-doc guarda | Porque não cabe no `PLAN.md §13` |
| --- | --- |
| Decisões tomadas na hora, com rationale | O plano foi escrito antes de o problema existir |
| Edge cases descobertos ao codar | São insumo do `[Dominio]`, não do plano |
| Scores de fricção PRÉ e PÓS, por agente | Sem registro, "review aprovado" vira palavra |
| Issues encontrados e a causa raiz | O que vira `DEBT-NN` sai daqui |

**Preço declarado (decisão de 06/08/2026, que revogou a proibição anterior de
sprint-doc):** as seções §objetivo, §escopo e §checklist **repetem** informação do
`PLAN.md §13`. É duplicação consciente — o sprint-doc é o painel operacional, o
`§13` é o canônico. O risco é drift; a mitigação é a regra acima: **em conflito,
`§13` vence, e o sprint-doc é corrigido, nunca o contrário.**

Se uma sprint fechar com §decisoes, §edge-cases, §scores e §issues todos vazios,
o doc não protegeu nada — e a decisão de mantê-los deve ser reaberta.
<!-- /§principio -->

---

<!-- §nomeacao -->
## Nomeação e amarração

```
api/docs/desenvolvimento/sprints/sprint-NN.MM-<escopo-em-kebab>.md
```

- `NN` — a sprint (agrupamento entregável). `MM` — o sub-doc dentro dela.
- Toda linha `NN.MM` **tem** uma fase `FN` correspondente em
  [PRODUCT.md §roadmap](PRODUCT.md). Sub-doc sem linha na tabela é órfão; fase sem
  sub-doc é trabalho sem registro.
- O doc é criado **antes** de codificar, com §objetivo, §decisoes, §nomes, §escopo e
  §edge-cases preenchidos. §scores e §issues nascem vazios e crescem durante a sprint.
- Arquivo **live**: reflete o estado atual. História é o `git log`.
<!-- /§nomeacao -->

---

<!-- §corpo -->
## Corpo a copiar

```markdown
# Sprint NN.MM — Título (FN de PLAN.md §13)

> Sumário:
> - §objetivo — o que esta sprint entrega e por quê
> - §decisoes — o que foi decidido na execução, com rationale
> - §nomes — identificadores fixados antes de codar
> - §escopo — plano ordenado por dependência
> - §edge-cases — os casos não-óbvios (insumo do [Dominio])
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS, por agente
> - §issues — o que apareceu durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — FN](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `<branch>` · **Início:** AAAA-MM-DD · **Fase:** FN
**Status:** ⬜ não iniciada | 🟨 em andamento | ✅ verde
**Agentes acionados:** `[Database]` `[Seguranca]` `[Dominio]` `[Backend]` `[Produto]` `[QA]`

---

<!-- §objetivo -->
## Objetivo

1–3 parágrafos em linguagem de produto, não de código. O que passa a ser possível
depois desta sprint que não era antes.

Incluir: módulos impactados · risco principal se falhar · agentes obrigatórios e
por qual gatilho de `CLAUDE.md §Ativação` eles entraram.

**Fora do escopo desta sprint:** o que alguém razoavelmente esperaria aqui e vem
depois — com a fase de destino. Corte silencioso vira buraco (PLAN §3.1).
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | | | | |

> Decisão que muda arquitetura, agregado ou contrato vira **ADR** em
> `PRODUCT.md §adrs` — aqui fica só o resumo e o ponteiro.
> Limite conhecido e aceito vira **`DEBT-NN`** em `DEBITOS-TECNICOS.md`.
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

**Definir ANTES de codar.** Nome trocado depois é migration a mais e busca global.
Convenção: código e banco em **inglês**; banco `snake_case`, tabela no plural;
constraints `pk_` `fk_` `uk_` `idx_` `ck_` (CLAUDE.md §Convenções · ADR-13).

| Tipo | Nome | Onde | Descrição |
| --- | --- | --- | --- |
| Tabela | `exemplos` | migration | |
| Coluna | `doctor_id` | `exemplos` | FK escopo do médico (INV-04) |
| Constraint | `uk_exemplos_doctor_id_slot` | `exemplos` | índice único parcial |
| Rota | `POST /api/exemplos` | controller | |
| Env | `EXEMPLO_TTL` | `.env.example` | |
| Erro | `EXAMPLE_CONFLICT` | `DomainError.code` | 409 |

> Sem regra de comprimento de identificador neste projeto — a de 30 caracteres é
> convenção MAPA e **não se aplica** aqui.
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

**Ordem importa.** Dependência primeiro; registro em módulo por último.
Todo caminho parte de `api/` (PLAN §10), exceto onde marcado `RAIZ`.

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Criar | `src/...` | NOVO | — |
| 2 | Editar | `src/...` | ALTER | 1 |

### Migrations (só quando a sprint toca banco)

| Arquivo | Escopo | Gerada por | Revisado |
| --- | --- | --- | --- |
| `<timestamp>-<escopo>.ts` | o que faz | `npm run migration:generate --name=<escopo>` | ⬜ SQL lido linha a linha |

> Migration é **gerada**, revisada por humano e **forward-only** (ADR-08).
> Aplicada nunca é editada — correção é migration nova.
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | | | teste / constraint / guard |
| 2 | Concorrência: dois requests no mesmo recurso | | |
| 3 | Cross-doctor: recurso de outro médico | 404 (nunca 403 — não vaza existência) | |

> Enumerar **todos** os casos não-óbvios. Esta seção é o insumo direto do
> `[Dominio]` na fricção PRÉ.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [ ] `npm run lint && npm run typecheck && npm run build && npm test` — todos verdes
- [ ] Critério "Pronto quando" da fase em `PLAN.md §13` satisfeito e verificado à mão

**Arquitetura**
- [ ] Regra de fronteira do ESLint (PLAN Apêndice C) intacta e **provada**: import de `typeorm`/`express`/cripto em `domains/domain/services/**` reprova o lint
- [ ] Service: um `execute`, sem `Request`/`Response`, sem ORM, sem `throw` para erro esperado
- [ ] Erro esperado é `Either<L,R>`; `DomainError` carrega `code` estável (ADR-05, ADR-06)
- [ ] Provider entrega o **adapter** da porta, nunca `Repository<T>` cru (ADR-02)
- [ ] Módulo de domínio não injeta token de repositório de outro — importa o módulo e usa o service exportado
- [ ] Agregados referenciados por ID; uma transação toca **um** agregado e vive no adapter (ADR-04)

**Banco** *(quando aplicável)*
- [ ] Migration gerada, SQL revisado linha a linha, forward-only; `synchronize: false`, sem `migrationsRun`
- [ ] Constraints nomeadas na própria entity (PLAN §6.3); nomes conforme `review-database.md §regras`
- [ ] Invariante crítica enforçada **também** no banco (ADR-09)

**Segurança**
- [ ] Toda leitura e escrita escopada por `doctorId` do token via `@CurrentDoctor()` (INV-04)
- [ ] Nenhum segredo comitado; `.env` fora do git; `.env.example` só com placeholder
- [ ] PII não vaza em log nem em mensagem de erro

**Contrato**
- [ ] Schema Zod `.strict()` na borda; Swagger sai do Zod, sem `@ApiProperty` manual (ADR-07)
- [ ] Status e envelope conforme `PLAN.md §9.3` e `§9.4`
- [ ] Mensagem ao usuário em PT-BR; código, arquivo e banco em inglês (ADR-13)

**Higiene**
- [ ] Nenhum `console.log`, nenhum `TODO`, nenhum arquivo morto
- [ ] Testes: caminho feliz + erro esperado + edge case, determinísticos (`review-testing.md §regras`)
- [ ] Scores ≥ 9/10 na fricção PÓS; zero CRÍTICO e zero ALTO em aberto
- [ ] Docs atualizadas: `PRODUCT.md §roadmap` (estado) · `§invariantes`/`§adrs` se mudou · `DEBITOS-TECNICOS.md` se nasceu limite conhecido
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PRÉ | /10 | | |
| `[Seguranca]` | PRÉ | /10 | | |
| `[Backend]` | PÓS | /10 | | |
| `[QA]` | PÓS | /10 | | |

**Conflitos entre agentes e como foram resolvidos:** (hierarquia numérica vence —
`CLAUDE.md §Resolução de conflito`)

> Fricção PÓS nunca é pulada. Fricção PRÉ nunca é pulada em PADRÃO ou COMPLEXO.
> Sem score registrado = sem aprovação = não se implementa.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | ADR-NN / DEBT-NN / — |

> Preencher **ao longo** da sprint, não no fim. Issue lembrada de memória no
> fechamento já perdeu a causa raiz.
<!-- /§issues -->

---

## Seções situacionais — incluir só quando aplicável

<!-- §riscos -->
### Riscos e mitigações *(sprints que tocam dados, auth ou invariante)*

| Risco | Impacto | Mitigação | Sinal de que aconteceu |
| --- | --- | --- | --- |
<!-- /§riscos -->

<!-- §antipatterns -->
### Anti-patterns descobertos

- ❌ Descrição do que não fazer → ✅ **fazer isto no lugar**
<!-- /§antipatterns -->
```
<!-- /§corpo -->

---

<!-- §preenchimento -->
## Regras de preenchimento

| Regra | Detalhe |
| --- | --- |
| **Antes de codar** | §objetivo, §decisoes, §nomes, §escopo, §edge-cases preenchidos. Sem isso não há fricção PRÉ possível |
| **Tipo** | Sempre `NOVO` ou `ALTER`. Nunca "ajustar" |
| **Depende de** | Lista de `#` do próprio §escopo. Vazio só na primeira linha |
| **Edge cases** | Enumerar **todos** os não-óbvios. É o insumo do `[Dominio]` |
| **Issues** | Preencher **durante**, não no fechamento |
| **Scores** | Toda fricção registrada, PRÉ e PÓS. Sem score = sem aprovação |
| **Situacionais** | Incluir só quando aplicável. **Nunca** preencher com "N/A" — seção vazia por ritual é a coisa que este repositório corta |
| **Duplicação** | §objetivo/§escopo/§checklist repetem o `PLAN.md §13` por decisão. **Divergiu, `§13` vence** |
| **Fechamento** | Status → ✅ só com o checklist inteiro marcado e `PRODUCT.md §roadmap` atualizado |
<!-- /§preenchimento -->
