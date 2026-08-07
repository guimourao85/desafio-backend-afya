# ProntoMed API

Backend de prontuário eletrônico: o médico cadastra pacientes, agenda consultas e
registra as anotações de cada atendimento.

> **Estado: 🚧 F1 concluída, mais o OpenAPI antecipado.** O projeto sobe com Docker,
> responde `/api/health`, conecta no Postgres e publica o Swagger em `/api/docs`.
> Sem autenticação e sem domínio ainda — isso vem de F2 em diante.
> O plano completo — requisitos, modelagem, invariantes, contratos da API e fases na
> ordem de execução — está em **[`api/docs/PLAN.md`](api/docs/PLAN.md)**.
> Este README é finalizado na F7, seguindo o contrato de `api/docs/PLAN.md §15`.

## Do clone ao Swagger

**Pré-requisito: Docker. Só isso** — nem Node, nem npm, nem Postgres no host,
inclusive para os testes. Todo comando roda da **raiz** do repositório.

| # | Ação | Comando |
| --- | --- | --- |
| 1 | Clonar a aplicação | `git clone https://github.com/guimourao85/desafio-backend-afya.git` |
| 2 | Entrar no repositório | `cd desafio-backend-afya` |
| 3 | Criar o `.env` (não precisa editar nada) | `cp api/.env.example api/.env` |
| 4 | Subir o ambiente — na 1ª vez builda, ~3 min | `docker compose up -d` |
| 5 | Conferir que a API está no ar | `curl localhost:3333/api/health` |
| 6 | Aplicar as migrations | `docker exec api-prontomed npm run migration:run` |
| 7 | Abrir o Swagger e usar a API | http://localhost:3333/api/docs |
| — | Derrubar tudo (`-v` apaga também os bancos) | `docker compose down [-v]` |

**Sobre cada passo:**

3. Os valores do exemplo sobem o ambiente inteiro, inclusive um `JWT_SECRET` que
   satisfaz o mínimo de 32 caracteres do schema. Fora de `localhost`, troque:
   `openssl rand -base64 48`.
4. O compose cria o volume, roda `api/db/init-test-db.sh` para criar os dois bancos
   (`prontomed` e `prontomed_test`) e só então sobe a API — quem garante a ordem é o
   `depends_on: service_healthy`.
5. Resposta esperada: `{"status":"ok"}`. Se demorar, a API ainda está compilando —
   `docker logs api-prontomed --tail 20` até aparecer `successfully started`.
6. **Não é opcional, e o passo 5 não denuncia a falta dele:** o healthcheck não sonda
   o banco de propósito (`api/docs/PLAN.md §13 F0`). Sem migrations a API sobe verde e
   só quebra na primeira rota que tocar uma tabela. Enquanto F2 não entrega a primeira
   tabela, a resposta é `No migrations are pending` — correto, o passo existe desde já
   para não ser esquecido quando passar a importar.
7. O Swagger é a ferramenta de avaliação: cada endpoint é executável dali (documento
   cru em `/api/docs-json`). Enquanto F2 não entra, há uma rota só e o **Authorize**
   ainda não abre nada — ele nasceu junto com o documento para que cada fase seguinte
   já apareça clicável.

## Stack

Node 22 · TypeScript 5 strict · **NestJS 10** · TypeORM (migrations geradas e
revisadas) · PostgreSQL 16 · Zod (`nestjs-zod`) · Jest + Supertest · Docker Compose.

Ambiente de **desenvolvimento apenas** — a POC é avaliada localmente.

## Arquitetura em três linhas

**DDD sobre hexagonal**: o caso de uso depende de uma **porta**, o provider entrega o
adapter TypeORM, e os agregados se referenciam por ID sem compartilhar transação.

```
gateways/http ──▶ domains/domain/services ──▶ repositories (portas)
                                                     ▲
                                     infrastructure (adapters TypeORM)
```

O service não importa `typeorm` e nenhum módulo injeta o repositório de outro —
isso é **regra de lint**, não promessa de README. O detalhe técnico, camada por
camada, está em **[`api/README.md`](api/README.md)**.

<a id="testes"></a>

## Testes

Tudo dentro do container, com o ambiente de pé:

| # | Ação | Comando |
| --- | --- | --- |
| 1 | Lint e tipos | `docker exec api-prontomed npm run lint` |
| 2 | Compilação | `docker exec api-prontomed npm run typecheck` |
| 3 | Testes unitários | `docker exec api-prontomed npm test` |
| 4 | Schema no banco de teste | `docker exec api-prontomed npm run migration:run:test` |
| 5 | Testes de integração | `docker exec api-prontomed npm run test:e2e` |

O passo 4 é um comando **separado** de propósito: são dois bancos no mesmo container,
e o e2e nunca toca o de desenvolvimento — é o que impede um teste de destruir o seed
de demonstração. Ele e o `test:e2e` declaram `NODE_ENV=test` explicitamente, então
valem igual dentro e fora do container.

> **Rodar no host é possível, mas só se `npm install` vier antes do primeiro
> `docker compose up`.** O compose monta um volume anônimo em
> `/usr/src/app/node_modules`, e o daemon cria esse ponto de montagem no host como
> `root` — depois disso, `npm install` no host falha com `EACCES` até você apagar
> `api/node_modules` com `sudo`. Dentro do container o problema não existe.

## Comandos

| Comando                                      | O que faz                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `docker compose up -d` / `down`              | sobe / derruba o ambiente                                                |
| `docker compose down -v`                     | derruba **apagando o volume** — necessário para recriar `prontomed_test` |
| `docker logs api-prontomed --tail 50`        | logs da API                                                              |
| `docker exec -it api-prontomed sh`           | shell dentro do container, para encadear vários `npm run`                |

Os scripts abaixo rodam com `docker exec api-prontomed npm run <script>` — ou direto,
de dentro de `api/`, se você tiver Node no host:

| Script | O que faz |
| --- | --- |
| `lint` · `typecheck` · `build` | gates de código |
| `test` · `test:e2e` | unitários · integração |
| `migration:run` | aplica as migrations no banco de **desenvolvimento** |
| `migration:run:test` | as mesmas migrations no `prontomed_test` — o banco que o e2e usa |
| `migration:generate --name=<escopo>` | gera a migration a partir das entities, para **revisão** antes do commit |

**Portas:** API em `3333`. Postgres em **`5433` no host** (dentro da rede Docker
continua `5432`) — 5432 pode estar ocupada por outro projeto na mesma máquina.

**Bancos:** `prontomed` (desenvolvimento) e `prontomed_test`, ambos no mesmo
container. O `prontomed_test` é criado por `api/db/init-test-db.sh`, que o Postgres
roda **só no primeiro boot do volume** — se ele não existir, `docker compose down -v`
e suba de novo.

**Migrations:** rodam por comando, nunca no boot (`synchronize: false`,
`migrationsRun: false`). São **dois** bancos e, portanto, dois comandos: quem for
rodar o e2e precisa ter aplicado `migration:run:test` antes, senão o teste falha
com `relation does not exist`. A linha do tempo é única, em
`api/src/infrastructure/databases/typeorm/postgres/migrations/`, e migration aplicada
nunca é editada — a correção é uma migration nova.

_A preencher: F6 (seed de demonstração), F7 (roteiro de avaliação em 6 passos —
login → Authorize → paciente → agendamento → o 409 do horário ocupado → anotação)._

## Documentação

| Documento                                              | Conteúdo                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`api/docs/PLAN.md`](api/docs/PLAN.md)                         | Plano de implementação completo, em ordem de execução                       |
| [`api/docs/PRODUCT.md`](api/docs/PRODUCT.md)                   | Produto e domínio: personas, jornadas, agregados, invariantes, ADRs         |
| [`api/docs/DEBITOS-TECNICOS.md`](api/docs/DEBITOS-TECNICOS.md) | Débitos declarados, com gatilho de reabertura                               |
| `/api/docs` (runtime)                                  | OpenAPI + Swagger UI, gerados dos schemas Zod — no ar com o container de pé |

## Origem

Desafio técnico "Desafio Backend" (Afya). A leitura do enunciado, a interpretação
dos wireframes e a rastreabilidade requisito → fase estão em `api/docs/PLAN.md` §1–§3.
