# ProntoMed API

Backend de prontuário eletrônico: o médico cadastra pacientes, agenda consultas e
registra as anotações de cada atendimento.

> **Estado: 🚧 F0 concluída.** O projeto sobe com Docker e responde `/api/health`.
> Sem banco de negócio, sem autenticação, sem domínio — isso vem de F1 em diante.
> O plano completo de implementação — requisitos, modelagem, invariantes, contratos
> da API e fases na ordem de execução — está em **[`docs/PLAN.md`](docs/PLAN.md)**.
> Este README é finalizado na F7, seguindo o contrato de `docs/PLAN.md §15`.

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
tokens em `shared/constants/repositories.ts`.

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

## Como rodar

Pré-requisitos: Docker e Node 22. Todo comando `npm` roda de dentro de `api/`;
o `docker-compose.yml` fica na **raiz** do repositório.

```bash
# 1. configuração — o .env é gitignorado e o compose o exige
cp api/.env.example api/.env

# 2. dependências — gera o package-lock.json que o `npm ci` da imagem consome,
#    e o node_modules do host, usado por lint/typecheck/test
cd api && npm install && cd ..

# 3. sobe api + postgres
docker compose up -d

# 4. confere
curl localhost:3333/api/health     # → {"status":"ok"}
```

Trocar o `JWT_SECRET` do `.env` por um valor próprio (`openssl rand -base64 48`);
o do `.env.example` é placeholder e só existe para o boot não falhar.

| Comando | O que faz |
| --- | --- |
| `docker compose up -d` / `down` | sobe / derruba o ambiente |
| `docker compose down -v` | derruba **apagando o volume** — necessário para recriar `prontomed_test` |
| `docker logs api-prontomed --tail 50` | logs da API |
| `npm run lint` · `typecheck` · `build` | gates de código |
| `npm test` · `npm run test:e2e` | unitários · integração |

**Portas:** API em `3333`. Postgres em **`5433` no host** (dentro da rede Docker
continua `5432`) — 5432 pode estar ocupada por outro projeto na mesma máquina.

**Bancos:** `prontomed` (desenvolvimento) e `prontomed_test`, ambos no mesmo
container. O `prontomed_test` é criado por `db/init-test-db.sh`, que o Postgres
roda **só no primeiro boot do volume** — se ele não existir, `docker compose down -v`
e suba de novo.

_A preencher: F2 (`npm run migration:run`), F6 (seed e Swagger em `/api/docs`),
F7 (roteiro de avaliação em 6 passos)._

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [`docs/PLAN.md`](docs/PLAN.md) | Plano de implementação completo, em ordem de execução |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Produto e domínio: personas, jornadas, agregados, invariantes, ADRs |
| [`docs/DEBITOS-TECNICOS.md`](docs/DEBITOS-TECNICOS.md) | Débitos declarados, com gatilho de reabertura |
| `/api/docs` (runtime) | OpenAPI + Swagger UI, gerados dos schemas Zod _(F6)_ |

## Origem

Desafio técnico "Desafio Backend" (Afya). A leitura do enunciado, a interpretação
dos wireframes e a rastreabilidade requisito → fase estão em `docs/PLAN.md` §1–§3.
