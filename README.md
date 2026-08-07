# ProntoMed API

Backend de um prontuário eletrônico de consultório. O médico se autentica, mantém a
própria base de pacientes, opera a agenda — que recusa dois atendimentos no mesmo
horário — e registra as anotações de cada consulta. Quando um paciente exerce o
direito ao esquecimento, a identificação é apagada **sem** perder o histórico de
atendimentos.

Há uma única persona e ela só enxerga o que é seu: paciente, agenda e anotação de
outro médico não existem para ela. Isso não é filtro de tela — é regra do domínio,
enforçada em toda leitura e escrita.

**O desafio.** Resposta a um desafio técnico de backend: API REST com autenticação,
cadastro de pacientes, agenda com regra de conflito, anotações de atendimento,
persistência relacional e documentação executável. A leitura do enunciado, a
interpretação dos wireframes e a rastreabilidade requisito → fase estão em
[`api/docs/PLAN.md`](api/docs/PLAN.md) §1–§3.

> **Estado: 🚧 F1 concluída, mais o OpenAPI antecipado.** O projeto sobe com Docker,
> responde `/api/health`, conecta no Postgres e publica o Swagger em `/api/docs`.
> Sem autenticação e sem domínio ainda — isso vem de F2 em diante.
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

Node 22 · TypeScript 5 strict · **NestJS 10** · TypeORM · PostgreSQL 16 ·
Zod (`nestjs-zod`) · Jest + Supertest · Docker Compose.

Ambiente de **desenvolvimento apenas** — a POC é avaliada localmente.

**Como o backend é construído** — DDD sobre hexagonal, com a regra de dependência
apontando para dentro e enforçada por lint — está em
**[`api/README.md`](api/README.md)**, que é o documento de arquitetura: camadas,
injeção de dependência, contrato de erro, persistência e estratégia de teste. Nada
disso é repetido aqui.

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

**Migrations:** rodam por comando, nunca no boot — e são **dois** bancos, portanto
dois comandos. O porquê disso e o fluxo de geração e revisão estão em
[`api/README.md`](api/README.md#persistência).

_A preencher: F6 (seed de demonstração), F7 (roteiro de avaliação em 6 passos —
login → Authorize → paciente → agendamento → o 409 do horário ocupado → anotação)._

## Documentação

Cada assunto tem **um** dono; os outros documentos apontam para ele.

| Se você quer | Vá para |
| --- | --- |
| Entender **como o backend é construído** — camadas, DI, contrato de erro, persistência, testes | [`api/README.md`](api/README.md) |
| Entender **o produto e o domínio** — personas, jornadas, agregados, invariantes, ADRs | [`api/docs/PRODUCT.md`](api/docs/PRODUCT.md) |
| Ver o **plano de execução** — requisitos, fases na ordem, contratos HTTP, padrões de código | [`api/docs/PLAN.md`](api/docs/PLAN.md) |
| Saber **o que ficou de fora e por quê**, com gatilho de reabertura | [`api/docs/DEBITOS-TECNICOS.md`](api/docs/DEBITOS-TECNICOS.md) |
| Acompanhar **como cada sprint foi executada** — decisões, issues, scores de review | [`api/docs/desenvolvimento/sprints/`](api/docs/desenvolvimento/sprints/) |
| **Exercitar a API** | `/api/docs`, com o ambiente de pé |
