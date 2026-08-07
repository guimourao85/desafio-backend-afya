# Sprint 01.03 — OpenAPI antecipado (item 1 de F6)

> Sumário:
> - §objetivo — o Swagger montado agora, para que F2 nasça navegável
> - §decisoes — 6 decisões, uma delas define o que **não** foi antecipado
> - §nomes — `setupSwagger`, `/api/docs`, `/api/docs-json`
> - §escopo — 8 passos
> - §edge-cases — 5 casos, um deles só verificável em 02.01
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS
> - §issues — o que aparecer durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — F6](../../PLAN.md) e [§14.3](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md)

**Branch:** `main` · **Início:** 2026-08-07 · **Fim:** 2026-08-07 · **Fase:** F6 (item 1, antecipado)
**Status:** ✅ verde — `lint` `typecheck` `build` `test` (21) `test:e2e` (15)
**Triagem:** PADRÃO (5 arquivos, sem banco/auth/invariante) → fricção PRÉ + implementar + fricção PÓS
**Agentes:** `[Produto]` (dono do Swagger) · `[Backend]`

---

<!-- §objetivo -->
## Objetivo

Montar a infraestrutura do OpenAPI — `patchNestJsSwagger()`, `DocumentBuilder`,
`addBearerAuth()`, `/api/docs` — **agora**, e não em F6.

O ganho não é hoje: hoje o Swagger mostra uma rota (`GET /api/health`) e o botão
**Authorize** não serve para nada, porque não existe rota autenticada. O ganho é
que **F2 nasce navegável**, e cada fase seguinte pode ser exercitada à mão no
momento em que é escrita, em vez de acumular quatro fases de API que só viram
clicáveis no fim.

Três razões para mover, além da conveniência:

1. **`review-backend.md §verifica` já cobra `@ApiTags`/`@ApiOperation` em toda rota
   nova.** Sem o documento montado, F2–F5 escreveriam decoração inerte por quatro
   fases, e ninguém veria o resultado até F6. A regra de review já pressupunha isto.
2. **A derivação Zod → OpenAPI é o único ponto de risco real do item 1**, e ela é
   verificável hoje (§escopo 5). Descobrir em F6 que um schema não deriva é
   retrabalho sobre 8 endpoints prontos.
3. É o mesmo padrão de falha diferida que a sprint 01.02 caçou três vezes
   (issues 1, 4 e a decisão 10b).

**Fora do escopo — continua em 05.01 (F6):**

| Item | Por quê fica |
| --- | --- |
| `@ApiResponse` com exemplos de request e response por rota | É trabalho **por endpoint**, e endpoint não existe ainda. Passa a acompanhar cada fase, não a se acumular |
| Ordem das tags (login → pacientes → agendamentos) | Não há duas tags para ordenar |
| Seed de demonstração | Nada a ver com OpenAPI; era item 3 de F6 |
| Roteiro do avaliador em 6 passos (§15) | Depende dos endpoints de F2–F5 |
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | O que antecipar | **Só o item 1 de F6** (infra) | Os itens 2 e 3 são trabalho por endpoint e por seed — não há o que antecipar sem eles existirem | Antecipar F6 inteiro: mover trabalho que não tem insumo |
| 2 | Onde o Swagger é montado | `setupSwagger()` em arquivo próprio, chamado pelo `bootstrap()` — **fora** do `configureApp()` | `configureApp()` é contrato HTTP e roda em todo e2e; montar OpenAPI em cada suíte é custo sem prova | Dentro do `configureApp()`: toda suíte paga |
| 3 | Como a montagem é exercitada | e2e próprio que chama `setupSwagger()` e afirma sobre o documento | Foi a lição do issue 4 de 01.02: configuração que só o `main.ts` executa não é exercitada por ninguém. A decisão 2 sozinha reintroduziria o problema | Confiar em abrir `/api/docs` no navegador |
| 4 | Provar a derivação Zod → OpenAPI **hoje** | O e2e monta o documento com o controller de sonda, que tem DTO Zod, e afirma `format: email` e `required[]` | É o único risco técnico do item 1 e o motivo nº 2 de antecipar. Antecipar sem verificar seria trocar uma falha diferida por outra | Esperar o primeiro DTO real, em F2 |
| 5 | Onde vive o controller de sonda | `test/factories/probe.controller.ts`, usado por **dois** e2e | `PLAN.md §10` já reserva `test/factories/` para arranjo reaproveitado; duplicar o controller em dois specs é ruído | Duplicar |
| 6 | Gate por ambiente no `/api/docs` | **Nenhum** | `APP_ENV` só assume `dev` (ADR-12); um `if` de produção seria código que nunca executa | `if (isDevelopment)` em volta do setup |

> Nenhuma muda agregado, invariante ou contrato de domínio — **nenhuma vira ADR**.
> A antecipação em si é mudança de **plano**, não de arquitetura: `PLAN.md §13` é
> corrigido para apontar onde o item foi parar.
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

| Tipo | Nome | Onde | Descrição |
| --- | --- | --- | --- |
| Função | `setupSwagger` | `src/swagger.setup.ts` | monta e publica o documento |
| Rota | `/api/docs` | — | UI, caminho literal: não sofre o prefixo global |
| Rota | `/api/docs-json` | — | o documento; é o que o e2e consome |
| Classe | `ProbeController` | `test/factories/` | sonda com DTO Zod, só de teste |
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Criar | `src/swagger.setup.ts` — `patchNestJsSwagger()`, `DocumentBuilder`, `addBearerAuth()` | NOVO | — |
| 2 | Editar | `src/main.ts` — `setupSwagger(app)` no `bootstrap()` | ALTER | 1 |
| 3 | Criar | `test/factories/probe.controller.ts` — extraído do e2e de envelope | NOVO | — |
| 4 | Editar | `test/integration/error-envelope.e2e-spec.ts` — passa a importar o factory | ALTER | 3 |
| 5 | Criar | `test/integration/openapi.e2e-spec.ts` — documento servido, bearer, derivação Zod | NOVO | 1, 3 |
| 6 | Editar | `api/README.md` — `/api/docs` deixa de ser "_(F6)_" | ALTER | 5 |
| 7 | Editar | `docs/PLAN.md §13` — F6 perde o item 1, com nota de onde ele foi parar | ALTER | — |
| 8 | Editar | `docs/PRODUCT.md §roadmap` — linha 01.03 | ALTER | — |
| 9 | Editar | `docs/PLAN.md §10` — a estrutura passa a prever os arquivos de composição na raiz de `src/` (achado da fricção PRÉ) | ALTER | 1 |

### Migrations

**Nenhuma.** Esta sprint não toca banco.
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | Prefixo global `api` + `SwaggerModule.setup('api/docs')` | A UI responde em `/api/docs`, sem virar `/api/api/docs` — o caminho do Swagger é literal | e2e |
| 2 | DTO Zod sem `patchNestJsSwagger()` | Schema sairia vazio, sem `format`/`required`. É exatamente o que o e2e detecta | e2e (decisão 4) |
| 3 | `/api/docs-json` | Servido automaticamente ao lado da UI; é o alvo das asserções | e2e |
| 4 | `APP_GUARD` global entrando em 02.01 | O Swagger é middleware, não rota do Nest — o guard não deve interceptá-lo. **Não verificável hoje**: sem guard, não há o que provar. Fica como item de 02.01 | — |
| 5 | Controller de sonda vazando para produção | Vive em `test/`, fora do `src/` — o `nest build` não o alcança | estrutura |
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` (21) + `test:e2e` (15) — todos verdes
- [x] `/api/docs` responde 200 `text/html` no container
- [x] `/api/docs-json` devolve o documento com `/api/health`

**Contrato**
- [x] `securitySchemes` contém o bearer, pronto para F2
- [x] O schema de um DTO Zod aparece derivado (`format: email`, `type: integer`, `required[]`), sem `@ApiProperty`
- [x] Título, descrição e versão conforme `PLAN.md §11.10`

**Arquitetura**
- [x] `setupSwagger` fora do `configureApp()` — só o e2e de OpenAPI o chama
- [x] A montagem é exercitada por teste, não só pelo `main.ts` (issue 4 de 01.02)
- [x] Nenhum artefato de teste dentro de `src/` — `find dist -iname "*probe*"` vazio

**Plano**
- [x] `PLAN.md §13 F6` aponta para cá; `§10` passou a listar os arquivos de composição
- [x] `PRODUCT.md §roadmap`: linha 01.03 criada e fechada
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Produto]` | PRÉ | **9/10** | MÉDIO (1) | O `/api/docs` de hoje é vitrine de uma rota, com um botão **Authorize** que ainda não abre nada. Preço declarado no §objetivo, não defeito: o ganho é F2 em diante. Título, descrição e `addBearerAuth` conforme `PLAN.md §11.10` |
| `[Backend]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | `swagger.setup.ts` seria o **segundo** arquivo de composição na raiz de `src/` que `PLAN.md §10` não prevê — o primeiro (`app.setup.ts`) entrou em 01.02 sem atualizar a estrutura, e estrutura documentada que não corresponde ao repositório é doc virando mentira. Resolvido com o passo 9. BAIXO não corrigido: `ProbeController` num diretório chamado `factories/` — é arranjo reaproveitado, que é o que `§10` reserva para lá |
| `[Produto]` | PÓS | **9/10** | MÉDIO (1) | Documento servido com título, descrição e versão de `§11.10`; bearer declarado; `/api/health` publicado com o `@ApiOperation` que já existia. O MÉDIO é o mesmo da PRÉ, e só F2 o resolve |
| `[Backend]` | PÓS | **10/10** | — | `setupSwagger` fora do `configureApp()`; a montagem é exercitada por e2e, não só pelo `main.ts`; sonda confinada a `test/` — confirmado com `find dist -iname "*probe*"`, que não devolve nada. `PLAN.md §10` passou a refletir o repositório |

**Verificações feitas à mão:**

```
curl /api/docs      → HTTP 200, text/html
curl /api/docs-json → {"openapi":"3.0.0","paths":{"/api/health":{...}},
                       "info":{"title":"ProntoMed API", ...}}   no container
find dist -iname "*probe*" → vazio (a sonda não chega ao build)
```

> A antecipação foi verificada onde importava: a derivação Zod → OpenAPI, que era
> o único risco técnico do item 1, está provada por teste **antes** de existir o
> primeiro DTO de produção. Se ela não funcionasse, a descoberta seria em F6, com
> oito endpoints escritos.
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| 1 | `PLAN.md §10` não previa arquivo de composição na raiz de `src/`, e já havia **um** lá desde 01.02 (`app.setup.ts`) | A estrutura foi escrita supondo `main.ts` + `app.module.ts` e mais nada solto. O issue 4 de 01.02 criou o primeiro sem atualizar o diagrama | `§10` passa a listar `app.setup.ts` e `swagger.setup.ts`, com o papel de cada um. Achado da fricção PRÉ, corrigido antes de codar | `PLAN.md` | passo 9 |
| 2 | A compatibilidade `nestjs-zod@3` × `@nestjs/swagger@7` era o risco que decidia a sprint — `patchNestJsSwagger` importa um caminho **interno** do swagger (`dist/services/schema-object-factory`) | Lib de terceiro acoplada a detalhe de implementação de outra | Verificado **antes** de planejar, com uma sonda descartável: o schema saiu com `format: email`, `type: integer` e `required[]`. Se tivesse falhado, a antecipação não teria sido proposta | — | — |
| 3 | O controller de sonda estava dentro do e2e de envelope, e o de OpenAPI precisava do mesmo | Nasceu inline em 01.02, quando havia um consumidor só | Extraído para `test/factories/probe.controller.ts` — que é o que `PLAN.md §10` reserva para arranjo reaproveitado | `test/factories/`, 2 e2e | passo 3 |

> Preencher **durante** a sprint, não no fechamento.
<!-- /§issues -->
