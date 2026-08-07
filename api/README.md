# ProntoMed API

Backend de prontuário eletrônico: o médico cadastra pacientes, agenda consultas e
registra as anotações de cada atendimento.

> **Estado: 🚧 F1 concluída, mais o OpenAPI antecipado.** O projeto sobe com Docker,
> responde `/api/health`, conecta no Postgres e publica o Swagger em `/api/docs`.
> Sem autenticação e sem domínio ainda — isso vem de F2 em diante.
> O plano completo — requisitos, modelagem, invariantes, contratos da API e fases na
> ordem de execução — está em **[`docs/PLAN.md`](docs/PLAN.md)**.
> Este README é finalizado na F7, seguindo o contrato de `docs/PLAN.md §15`.

## Do clone ao Swagger

**Pré-requisito: Docker. Só isso** — nem Node, nem npm, nem Postgres no host,
inclusive para rodar os testes. Todo comando abaixo roda da **raiz** do repositório,
onde mora o `docker-compose.yml`.

```bash
# 1. configuração — o .env é gitignorado, e o compose o exige nos dois serviços
cp api/.env.example api/.env
```

Não é preciso editar nada. Os valores do exemplo sobem o ambiente inteiro, inclusive
um `JWT_SECRET` placeholder que satisfaz o mínimo de 32 caracteres do schema. Se este
projeto algum dia sair de `localhost`, aí sim: `openssl rand -base64 48`.

```bash
# 2. sobe o ambiente
docker compose up -d
```

Na primeira vez isto **builda a imagem** (`npm ci` completo, ~3 min). O compose cria o
volume do Postgres, roda `db/init-test-db.sh` para criar os dois bancos (`prontomed` e
`prontomed_test`) e só então sobe a API — o `depends_on: service_healthy` garante a
ordem. Nas próximas vezes, segundos.

```bash
# 3. confere que a API está no ar
curl localhost:3333/api/health          # → {"status":"ok"}
```

Se ainda não responder, a API está compilando: `docker logs api-prontomed --tail 20`
mostra o progresso e espera-se `Nest application successfully started`.

```bash
# 4. aplica as migrations no banco de desenvolvimento
docker exec api-prontomed npm run migration:run
```

**Este passo não é opcional, e o `/api/health` não denuncia a falta dele** — o
healthcheck não sonda o banco de propósito (`docs/PLAN.md §13 F0`). Sem as migrations,
a API sobe verde e só quebra na primeira rota que tocar uma tabela.

> Roda **dentro do container**: usa o `node_modules` da imagem e o
> `POSTGRES_HOST=database` da rede do compose. É o mesmo banco que você alcançaria do
> host por `localhost:5433`.
>
> Enquanto F2 não entrega a primeira tabela, o comando responde
> `No migrations are pending` e cria apenas o ledger `typeorm_migrations`. Está certo:
> o passo existe desde já para não ser esquecido quando passar a importar.

```bash
# 5. abre a API
http://localhost:3333/api/docs
```

O Swagger é a ferramenta de avaliação: cada endpoint é executável dali. Enquanto F2
não entra, há uma rota só (`GET /api/health`) e o botão **Authorize** ainda não abre
nada — ele nasceu junto com o documento para que cada fase seguinte já apareça
clicável. O documento cru fica em `/api/docs-json`.

**Para derrubar:** `docker compose down` — ou `docker compose down -v` para apagar
também os bancos, que é o que força o `init-test-db.sh` a rodar de novo.

## Stack

Node 22 · TypeScript 5 strict · **NestJS 10** · TypeORM (migrations geradas e
revisadas) · PostgreSQL 16 · Zod (`nestjs-zod`) · Jest + Supertest · Docker Compose.

Ambiente de **desenvolvimento apenas** — a POC é avaliada localmente.

## Arquitetura em cinco linhas

A estrutura espelha a da **referência técnica**: `domains/domain` (entities,
services, portas) · `gateways/http` (controllers, schemas Zod, pipes) ·
`framework` (guards, filtro de exceções) · `infrastructure` (DataSource,
migrations, adapters) · `presentation` (presenters) · `shared` (tokens, `Either`,
env). A injeção de dependência é a do NestJS: `*.module.ts` + `*.provider.ts`, com
tokens em `shared/constants/`.

Sobre essa estrutura, duas proteções: **hexagonal** — o service depende de uma
**porta**, e o provider entrega o adapter TypeORM; e **DDD** — quatro agregados
(`Doctor`, `RefreshSession`, `Patient`, `Appointment`, com as anotações dentro
dele) que se referenciam **por ID** e nunca compartilham transação.

```
gateways/http ──▶ domains/domain/services ──▶ repositories (portas)
                                                     ▲
                                     infrastructure (adapters TypeORM)
```

O service não importa `typeorm` e nenhum módulo injeta o repositório de outro —
isso é **regra de lint**, não promessa de README.

<a id="testes"></a>

## Testes

Tudo dentro do container, com o ambiente de pé:

```bash
docker exec api-prontomed npm run lint
docker exec api-prontomed npm run typecheck
docker exec api-prontomed npm test                   # unitários
docker exec api-prontomed npm run migration:run:test # schema no banco de teste
docker exec api-prontomed npm run test:e2e           # integração, contra o Postgres real
```

O `migration:run:test` é um comando **separado** de propósito: são dois bancos no
mesmo container, e o e2e nunca toca o de desenvolvimento — é o que impede um teste de
destruir o seed de demonstração. Os dois scripts declaram `NODE_ENV=test`
explicitamente, então valem tanto aqui quanto rodados de fora.

> **Rodar no host é possível, mas só se `npm install` vier antes do primeiro
> `docker compose up`.** O compose monta um volume anônimo em
> `/usr/src/app/node_modules`, e o daemon cria esse ponto de montagem no host como
> `root` — depois disso, `npm install` no host falha com `EACCES` até você apagar
> `api/node_modules` com `sudo`. Dentro do container o problema não existe.

## Comandos

| Comando | O que faz |
| --- | --- |
| `docker compose up -d` / `down` | sobe / derruba o ambiente |
| `docker compose down -v` | derruba **apagando o volume** — necessário para recriar `prontomed_test` |
| `docker logs api-prontomed --tail 50` | logs da API |
| `docker exec -it api-prontomed sh` | um shell dentro do container, para rodar `npm run ...` sem Node no host |
| `npm run lint` · `typecheck` · `build` | gates de código |
| `npm test` · `npm run test:e2e` | unitários · integração |
| `npm run migration:run` | aplica as migrations no banco de **desenvolvimento** |
| `npm run migration:run:test` | as mesmas migrations no `prontomed_test` — o banco que o e2e usa |
| `npm run migration:generate --name=<escopo>` | gera a migration a partir das entities, para **revisão** antes do commit |

**Portas:** API em `3333`. Postgres em **`5433` no host** (dentro da rede Docker
continua `5432`) — 5432 pode estar ocupada por outro projeto na mesma máquina.

**Bancos:** `prontomed` (desenvolvimento) e `prontomed_test`, ambos no mesmo
container. O `prontomed_test` é criado por `db/init-test-db.sh`, que o Postgres
roda **só no primeiro boot do volume** — se ele não existir, `docker compose down -v`
e suba de novo.

**Migrations:** rodam por comando, nunca no boot (`synchronize: false`,
`migrationsRun: false`). São **dois** bancos e, portanto, dois comandos: quem for
rodar o e2e precisa ter aplicado `migration:run:test` antes, senão o teste falha
com `relation does not exist`. A linha do tempo é única, em
`src/infrastructure/databases/typeorm/postgres/migrations/`, e migration aplicada
nunca é editada — a correção é uma migration nova.

_A preencher: F6 (seed de demonstração), F7 (roteiro de avaliação em 6 passos —
login → Authorize → paciente → agendamento → o 409 do horário ocupado → anotação)._

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`docs/PLAN.md`](docs/PLAN.md) | Plano de implementação completo, em ordem de execução |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Produto e domínio: personas, jornadas, agregados, invariantes, ADRs |
| [`docs/DEBITOS-TECNICOS.md`](docs/DEBITOS-TECNICOS.md) | Débitos declarados, com gatilho de reabertura |
| `/api/docs` (runtime) | OpenAPI + Swagger UI, gerados dos schemas Zod — no ar com o container de pé |

## Origem

Desafio técnico "Desafio Backend" (Afya). A leitura do enunciado, a interpretação
dos wireframes e a rastreabilidade requisito → fase estão em `docs/PLAN.md` §1–§3.
