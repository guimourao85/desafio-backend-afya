# DOC-STANDARDS.md — Como escrever documentação neste repositório

> Sumário:
> - §principio — para que a doc existe e quando ela vira ritual
> - §estrutura — sumário no topo + marcadores de seção (o que torna a leitura cirúrgica)
> - §fonte-unica — cada fato mora em um documento; os outros apontam
> - §checklist — o que conferir antes de dar um MD por pronto

---

<!-- §principio -->
## Princípio

A documentação existe para que uma tarefa seja executada **sem reler o repositório
inteiro** — e para que quem chega frio (outra pessoa, outra sessão) reconstrua o
contexto pelo texto, não por arqueologia de código.

Três regras que decorrem disso:

1. **Doc de referência é espelho do estado atual, não diário.** Escreva o que *é*, não o que *foi*. História de decisão vive no `git log` e nas ADRs.
2. **Alternativa rejeitada vira ADR; limite conhecido vira débito.** Se a decisão custou pensamento, ela precisa sobreviver ao pensamento.
3. **Rigor que vira ritual é erro.** Se uma seção nunca é lida antes de agir, ela não está protegendo nada — corte.
<!-- /§principio -->

---

<!-- §estrutura -->
## Estrutura obrigatória

Todo MD de referência (`PRODUCT.md`, `PLAN.md`, `DEBITOS-TECNICOS.md`,
`SPRINT-TEMPLATE.md`, `review-*.md`, `desenvolvimento/sprints/*.md`) tem **duas**
coisas, sempre:

### 1. Sumário no topo (linhas 3–15)

Uma linha por seção, com o `§id` e o que ela resolve. É o que permite escolher a
seção certa em O(1), sem abrir o arquivo inteiro.

```markdown
> Sumário:
> - §invariantes — as 7 leis do sistema, com enforcement e resposta HTTP
> - §adrs — decisões arquiteturais com alternativa rejeitada e preço
```

### 2. Marcadores de seção, abertos **e fechados**

```markdown
<!-- §invariantes -->
## Invariantes
...
<!-- /§invariantes -->
```

- `§id` em `kebab-case`, sem acento. Sub-seção: `§banco.entidades` — e ela é **auto-contida**: pode ser carregada sem o pai.
- **Fechamento é obrigatório.** Sem o marcador de fim (`/§id`), não dá para delimitar a leitura, e o carregamento cirúrgico degenera em ler o arquivo todo.
- O `§id` do sumário, o do marcador e o citado nos gatilhos do `CLAUDE.md` são **o mesmo texto**. Gatilho apontando para marcador inexistente é rota morta — pior que ausência, porque promete contexto e entrega nada.
<!-- /§estrutura -->

---

<!-- §fonte-unica -->
## Fonte única

Cada fato mora em **um** documento. Os demais **apontam**, não recopiam.

| Fato | Autoridade |
| --- | --- |
| Persona, jornada, agregado, invariante, ADR, inventário de banco | `PRODUCT.md` |
| Fases, contratos HTTP, padrões de código, qualidade, ambiente | `PLAN.md` |
| Regra de banco (tipo, constraint, índice, migration) | `contexto_agentes/review-database.md` |
| Débito técnico | `DEBITOS-TECNICOS.md` |
| Como trabalhar no repositório, PLC, agentes, triage | `CLAUDE.md` |
| Formato do sub-doc de sprint | `SPRINT-TEMPLATE.md` |
| Registro de execução de uma sprint (decisões da hora, edge cases, scores, issues) | `desenvolvimento/sprints/sprint-NN.MM-*.md` |

Duplicar uma tabela de invariantes, ADRs ou débitos entre dois documentos **não é
redundância defensiva — é drift garantido**: um dos dois será atualizado, e o
outro passará a mentir com aparência de autoridade.

Exceção única: um **resumo de uma linha** com ponteiro explícito para a
autoridade (`> Regra completa: review-database.md §tipagem`). Resumo não é cópia.

**Exceção declarada, com preço:** o sub-doc de sprint repete objetivo, escopo e
critério de pronto que já vivem em `PLAN.md §13`. É duplicação assumida (decisão de
06/08/2026) — o sprint-doc é operacional, o `§13` é canônico. A mitigação do drift é
uma regra de precedência, não a ausência de cópia: **divergiu, `PLAN.md §13` vence.**
<!-- /§fonte-unica -->

---

<!-- §checklist -->
## Checklist antes de dar um MD por pronto

- [ ] Sumário no topo, uma linha por seção, com o `§id` real
- [ ] Todo marcador de abertura (`§id`) tem o de fechamento (`/§id`) correspondente
- [ ] Todo `§id` citado no `CLAUDE.md` existe no arquivo alvo
- [ ] Nenhum fato duplicado de outro documento (só ponteiro)
- [ ] Estado atual, não narrativa de sprint
- [ ] Alternativa rejeitada virou ADR; limite conhecido virou `DEBT-NN`
- [ ] Tabela em vez de prosa onde o conteúdo é enumerável
- [ ] Nenhuma seção que ninguém carregaria antes de agir
<!-- /§checklist -->
