# Sprint 02.01 — Credencial e login (F2, parte 1 de 2)

> Sumário:
> - §contexto — **tudo que a implementação precisa, embutido**: este doc é auto-contido
> - §objetivo — a primeira tabela, a primeira migration e o login funcionando ponta a ponta
> - §decisoes — 15 decisões; quatro divergem do plano e o corrigem
> - §nomes — 2 tabelas, 6 constraints, 2 tokens de DI, os nomes de classe
> - §escopo — 27 passos: constantes → entity → migration → cripto → porta → adapter → service → HTTP → seed → teste
> - §edge-cases — 15 casos, com destaque para o que o gerador de migration **não** produz
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS
> - §issues — o que aparecer durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — F2](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-07 · **Fase:** F2 (parte 1 de 2)
**Status:** ✅ fechada em 2026-08-07 — **fricção PRÉ e PÓS aprovadas** (9/10 nos quatro agentes em ambas). 8 issues registrados; 3 achados PÓS corrigidos antes do fechamento
**Triagem:** COMPLEXO (≈22 arquivos, primeira migration, agregado novo, cripto) → plano + fricção PRÉ ≥9/10 + aprovação + implementar + fricção PÓS
**Agentes:** `[Backend]` `[Dominio]` (no limite) · `[Database]` `[Seguranca]` `[QA]` (obrigatórios, fora do limite)

---

<!-- §contexto -->
## Contexto embutido — leia só este arquivo

**Auto-contido por decisão.** Quem implementar com o contexto zerado não precisa
abrir `PLAN.md` nem `PRODUCT.md`: o necessário foi resolvido aqui.

> **Preço declarado.** As caixas abaixo **duplicam** `PLAN.md §6.2`, `§8.2`, `§8.4` e
> `PRODUCT.md §invariantes`. Duplicação consciente, mesma doutrina de 01.02 e 01.03.
> **Divergiu? O documento canônico vence, e quem se corrige é este arquivo.**

### Estado do repositório ao abrir a sprint

F1 entregou o kernel: `Either`, `DomainError` com `code` de tipo fechado,
`AllExceptionsFilter` com 5 ramos, `APP_PIPE` global com Zod, os dois `DataSource`
e o `DatabaseModule`. A sprint 01.03 pôs o OpenAPI em `/api/docs`.

**Não existe nenhuma entity, nenhuma migration e nenhuma tabela de negócio.** O
barril `model-entities/index.ts` é `export default []`. O banco tem só
`typeorm_migrations`, nos dois bancos. Gates verdes: `lint` `typecheck` `build`
`test` (21) `test:e2e` (15).

### DDL alvo (PLAN §6.2) — o que a migration gerada tem de produzir

```sql
CREATE TABLE doctors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(150) NOT NULL,
  email         varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uk_doctors_email UNIQUE (email)
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   uuid        NOT NULL REFERENCES doctors(id),
  token_hash  char(64)    NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_refresh_tokens_hash UNIQUE (token_hash)
);
CREATE INDEX idx_refresh_tokens_doctor ON refresh_tokens (doctor_id);
```

### As duas entities — **código verificado**, não esboço

Este é o texto que produz exatamente o DDL acima. Foi rodado contra o gerador na
fricção PRÉ; o SQL resultante está na caixa seguinte.

```ts
// domains/domain/model-entities/doctor.entity.ts
@Entity({ name: 'doctors' })
@Unique('uk_doctors_email', ['email'])
export class Doctor {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_doctors' })
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

// domains/domain/model-entities/refresh-token.entity.ts
@Entity({ name: 'refresh_tokens' })
@Unique('uk_refresh_tokens_hash', ['tokenHash'])
@Index('idx_refresh_tokens_doctor', ['doctorId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_refresh_tokens' })
  id!: string;

  @Column({ name: 'doctor_id', type: 'uuid' })   // ← ID puro, sem @ManyToOne (ADR-04)
  doctorId!: string;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
```

O barril passa a ser `export default [Doctor, RefreshToken]` — **nesta ordem**, que é
a ordem em que o gerador emite os `CREATE TABLE`. `doctors` precisa vir primeiro,
senão a FK acrescentada na revisão referencia tabela inexistente.

### O SQL que o gerador produz — o alvo da revisão

Verificado na fricção PRÉ, **já com a decisão 13 aplicada**:

```sql
CREATE TABLE "doctors" ("id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying(150) NOT NULL, "email" character varying(255) NOT NULL,
  "password_hash" character varying(255) NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "uk_doctors_email" UNIQUE ("email"),
  CONSTRAINT "pk_doctors" PRIMARY KEY ("id"))

CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "doctor_id" uuid NOT NULL, "token_hash" character(64) NOT NULL,
  "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "revoked_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "uk_refresh_tokens_hash" UNIQUE ("token_hash"),
  CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"))

CREATE INDEX "idx_refresh_tokens_doctor" ON "refresh_tokens" ("doctor_id")

-- down(), na ordem inversa:
DROP INDEX "public"."idx_refresh_tokens_doctor"
DROP TABLE "refresh_tokens"
DROP TABLE "doctors"
```

**O que falta aí é a FK** — o gerador não a produz, e é isso que o passo 6 do §escopo
acrescenta à mão, no `up()` e no `down()`:

```ts
await queryRunner.query(`ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "fk_refresh_tokens_doctors"
  FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id")`);
// down(): ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_doctors"
```

### O `JwtModule` — onde ele entra

`@nestjs/jwt` precisa ser registrado, e o único lugar que o conhece é o
`CryptographyModule`, atrás da porta:

```ts
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [EnvironmentService],
      useFactory: (env: EnvironmentService) => ({
        secret: env.get('JWT_SECRET'),
        signOptions: { expiresIn: env.get('JWT_ACCESS_TTL') },   // '15m'
      }),
    }),
  ],
  providers: [
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: TokenIssuer, useClass: JwtTokenIssuer },
  ],
  exports: [PasswordHasher, TokenIssuer],
})
export class CryptographyModule {}
```

Nenhum outro módulo importa `JwtModule` — quem precisa de token importa
`CryptographyModule` e injeta a porta.

### Invariantes em jogo (PRODUCT §invariantes)

| ID | Invariante | Onde se prova nesta sprint |
| --- | --- | --- |
| **INV-06** | Refresh é persistido **só** como SHA-256; o valor em claro só existe na resposta HTTP | e2e consulta `refresh_tokens` e afirma que o token da resposta **não** está na tabela |
| **INV-07** | Nenhuma resposta contém `password_hash` nem `token_hash` | `SessionPresenter` é a única via de serialização; e2e afirma a ausência |
| **INV-04** | Todo dado é escopado por `doctorId` do token | **não** se aplica ainda: sem guard, sem rota autenticada. Entra em 02.02 |

### As duas portas de criptografia (PLAN §8.4, com a decisão 3 aplicada)

```ts
// shared/interfaces/cryptography/password-hasher.ts
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract compare(plain: string, hash: string): Promise<boolean>;
}

// shared/interfaces/cryptography/token-issuer.ts
export abstract class TokenIssuer {
  abstract issueAccessToken(
    payload: { sub: string; email: string },
  ): Promise<{ token: string; expiresInSeconds: number }>;   // ← decisão 3
  abstract generateRefreshToken(): string;          // 32 bytes aleatórios, base64url
  abstract hashRefreshToken(token: string): string; // SHA-256 hex (INV-06)
}
```

Classe abstrata, não `interface`: serve de contrato **e** de token de DI, sem
`@Inject('STRING')`.

### O fluxo de login (PLAN §8.2)

```
POST /api/auth/login { email, password }
  ├─ email não existe .......... 401 INVALID_CREDENTIALS
  ├─ senha não confere ......... 401 INVALID_CREDENTIALS   ← mensagem idêntica
  └─ ok → grava SHA-256 do refresh (INV-06)
          200 { accessToken, refreshToken, expiresIn: 900 }
```

**200, não 201** — `@HttpCode(HttpStatus.OK)`, porque o `@Post()` do Nest devolve 201
por padrão e login não cria recurso.

### O que já existe e deve ser usado, não reinventado

| Peça | Onde | Como se usa aqui |
| --- | --- | --- |
| `Either` / `left` / `right` | `shared/errors/either.ts` | o service devolve `Left(InvalidCredentialsError)` |
| `InvalidCredentialsError` | `shared/errors/types/` | já existe, com `code` no catálogo → o filtro traduz para 401 |
| `PRONTOMED_POSTGRES_DATA_SOURCE` | `shared/constants/index.ts` | injetado no `*.provider.ts` para construir os adapters |
| `EnvironmentService` | `shared/environments/` | `JWT_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL_HOURS`, `BCRYPT_ROUNDS`, `SEED_DOCTOR_*` — todas já validadas no boot |
| `APP_PIPE` global | `gateways/http/http.module.ts` | valida o DTO Zod sem nada a registrar por rota |
| `AllExceptionsFilter` | `framework/filters/errors/` | traduz o `DomainError` — o controller só faz `throw result.value` |
| `createZodDto` + `patchNestJsSwagger` | já no ar | o schema Zod documenta a rota sozinho, sem `@ApiProperty` |

### Fatos verificados antes de planejar (não re-verificar)

```
@nestjs/jwt@10 e bcryptjs@2 já estão em dependencies desde F0 — nada a instalar
.env já traz JWT_SECRET, JWT_ACCESS_TTL=15m, REFRESH_TOKEN_TTL_HOURS=8,
         BCRYPT_ROUNDS=10, SEED_DOCTOR_EMAIL, SEED_DOCTOR_PASSWORD
package.json já tem o script `seed` apontando para seeds/demo.seed.ts — só falta o arquivo
```
<!-- /§contexto -->

---

<!-- §objetivo -->
## Objetivo

Fazer o login funcionar de ponta a ponta: `POST /api/auth/login` recebe email e
senha, confere contra o hash bcrypt, emite um JWT de 15 minutos e um refresh opaco
de 8 horas, e devolve os dois. É a primeira vez que este projeto **escreve no
banco**.

Esta é a metade de F2 que estabelece as fundações caras de desfazer: o schema das
duas tabelas, a forma das portas de criptografia e o formato da sessão. A outra
metade — guard global, `refresh`, `logout`, `me` — é a sprint 02.02, e depende
inteiramente do que se decidir aqui.

**Módulos impactados:** nasce o `AuthenticationModule`. Tocam `shared/constants`,
`shared/interfaces/cryptography`, `framework/cryptography`, `infrastructure/…/repositories`,
`presentation/presenters` e o `HttpModule`.

**Risco principal:** a migration. É a primeira, é forward-only, e nomes de constraint
errados só aparecem quando alguma outra coisa depender deles. **Risco número dois:**
INV-06 — gravar o refresh em claro é o defeito que mais custa reputação num
prontuário, e é silencioso.

**Fora do escopo desta sprint:**

| Item | Vai para |
| --- | --- |
| `JwtAuthGuard`, `APP_GUARD`, `@Public()`, `@CurrentDoctor()` | **02.02** |
| `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | 02.02 |
| `RefreshTokenRepository.findValidByHash` / `revokeByHash` | 02.02 — a porta nasce só com `create` |
| Qualquer coisa de idempotência, retry ou carga | sprint dedicada, por decisão do usuário |
| Seed de pacientes e consultas | 05.01 (F6) — aqui entra **só** o médico |
| `@ApiResponse` com exemplos de todos os erros | acompanha cada rota; o essencial entra já |
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| 1 | Corte de F2 | **Vertical**: 02.01 entrega login ponta a ponta; 02.02 entrega guard e o resto da sessão | Cada metade prova algo observável, e a migration é exercitada por um e2e que insere e lê de verdade | Horizontal (infra primeiro): 02.01 fecharia sem nada demonstrável |
| 2 | Tokens de repositório | `shared/constants/repositories.ts` nasce agora, com os dois primeiros | É o que `PLAN.md §10` reserva para lá. A fricção de 01.02 cortou o arquivo **vazio**; agora ele tem conteúdo | Deixar em `constants/index.ts`: mistura token de infraestrutura com token de domínio |
| **3** | Assinatura de `issueAccessToken` | Devolve **`{ token, expiresInSeconds }`**, divergindo de `PLAN.md §8.4` | O contrato publica `expiresIn: 900`, e quem conhece o TTL é o adapter, que lê `JWT_ACCESS_TTL='15m'`. Sem isto, alguém converte `'15m'` em segundos fora da porta — parsing de formato de lib vazando para o service | Manter `Promise<string>`: empurra a conversão para o caso de uso ou inventa env nova. **`PLAN.md §8.4` é corrigido no fechamento** |
| **4** | A FK `refresh_tokens.doctor_id → doctors` | Escrita **na revisão da migration**, à mão, não pela entity | ADR-04: agregados se referenciam por ID, sem relação navegável. `@ManyToOne` geraria a FK mas criaria o join proibido entre agregados. A FK é decisão de *persistência*, e a revisão da migration é obrigatória de qualquer forma | `@ManyToOne` só para o gerador produzir a FK: fura o ADR para economizar três linhas de SQL |
| 5 | `uk_doctors_email` | `@Unique('uk_doctors_email', ['email'])`, não `@Index(unique)` | O DDL alvo diz `CONSTRAINT … UNIQUE`; `@Index` produziria `CREATE UNIQUE INDEX`. Funcionalmente equivalente no Postgres, textualmente divergente do §6.2 — e é contra o §6.2 que o `[Database]` revisa | `@Index(… { unique: true })` |
| 6 | Normalização de email | `.toLowerCase().trim()` no **schema Zod**, na borda | `Medico@X` e `medico@x` são a mesma pessoa; sem normalizar, `uk_doctors_email` não impede o par duplicado e o login falha por motivo invisível. A borda é onde o dado ainda é texto | Normalizar no service: regra de formato não é regra de negócio. No banco (`citext`): extensão a mais para um caso resolvido em uma linha |
| 7 | Resposta a email inexistente | **Idêntica** à de senha errada: 401 `INVALID_CREDENTIALS`, mesma mensagem | Distinguir permite enumerar usuários — `review-security.md §verifica` item 4 | Mensagem específica, "melhor para o usuário" |
| 8 | Onde nasce o `expires_at` do refresh | No **service**, `now + REFRESH_TOKEN_TTL_HOURS` | É regra de sessão, não de persistência. O adapter só grava o que recebe | `DEFAULT now() + interval` no banco: esconde a regra no schema |
| 9 | Geração do refresh | `crypto.randomBytes(32).toString('base64url')`, dentro do **adapter** | `review-security.md`: aleatoriedade criptográfica, nunca `Math.random`/`uuid`. E `node:crypto` é proibido no service por lint — a porta existe exatamente para isso | `randomUUID()`: 122 bits de entropia e formato previsível |
| 10 | Seed | `demo.seed.ts` cria **só o médico**, a partir de `SEED_DOCTOR_*` | Sem médico no banco, o login não é exercitável no Swagger e a validação manual de tudo que vier depois fica bloqueada até F6 | Esperar F6: quatro sprints sem poder clicar em nada |
| 11 | Reexecução do seed | **Nenhum tratamento.** Rodar duas vezes esbarra em `uk_doctors_email` e falha | Idempotência é tema de sprint própria, por decisão do usuário. Aqui fica **declarado** como comportamento conhecido, não como defeito | Fazer `ON CONFLICT DO NOTHING` agora: decisão parcial sobre um tema que será tratado inteiro depois |
| 12 | Teste unitário do service | `TestingModule` com `DoctorRepository` in-memory e `PasswordHasher` falso | O ganho concreto de `§8.4`: sem o falso, cada caso paga ~80 ms de bcrypt | Instanciar com `new`, ou usar bcrypt de verdade |
| **13** | Função de UUID no `DEFAULT` | **`uuidExtension: 'pgcrypto'`** nos **dois** DataSources | Sem isso o gerador emite `uuid_generate_v4()` e o TypeORM instala a extensão `uuid-ossp` **por fora da migration** — efeito colateral ausente do arquivo revisado, que o `down()` não desfaz, e schema divergente do §6.2. Com a opção, o SQL sai `gen_random_uuid()`, como especificado. Achado ALTO da fricção PRÉ, com as duas versões verificadas contra o banco | Trocar à mão na revisão: a próxima regeneração traz o `uuid_generate_v4()` de volta. Aceitar `uuid-ossp`: dependência de extensão para o que o PG 13+ tem nativo |
| **14** | Login com email inexistente | Comparar contra um **hash descartável** antes de devolver o erro | Sem isso o caminho "não existe" pula o bcrypt e responde em ~1 ms, contra ~80 ms do caminho "senha errada": dá para enumerar quem tem conta cronometrando. A decisão 7 iguala a *mensagem*; esta iguala o *tempo* | Só igualar a mensagem: fecha a porta da frente e deixa a janela aberta |
| **15** | Tempo no teste do `expires_at` | `jest.useFakeTimers()` com instante fixo no spec | O service usa `new Date()`, e `review-testing.md §regras` trata data não controlada em teste como achado ALTO — é o teste que quebra à meia-noite | Tolerância (`expect(diff).toBeCloseTo`): esconde erro de fuso e de unidade |

> A **nº 3** altera contrato de **código** (`PLAN.md §8.4`) e a **nº 4** altera o
> procedimento de migration (`§6.3`). As duas corrigem o plano no fechamento — não
> viram ADR, porque não mudam agregado, invariante nem contrato externo. A **nº 13**
> corrige o Apêndice do DataSource e vale para toda tabela futura, não só para estas
> duas.
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

### Banco

| Tipo | Nome | Tabela | Observação |
| --- | --- | --- | --- |
| Tabela | `doctors` · `refresh_tokens` | — | plural, `snake_case`, inglês |
| PK | `pk_doctors` · `pk_refresh_tokens` | ambas | via `primaryKeyConstraintName` |
| Unique | `uk_doctors_email` | doctors | `@Unique` (decisão 5) |
| Unique | `uk_refresh_tokens_hash` | refresh_tokens | `char(64)`, SHA-256 hex |
| FK | `fk_refresh_tokens_doctors` | refresh_tokens | **escrita na revisão** (decisão 4) |
| Índice | `idx_refresh_tokens_doctor` | refresh_tokens | serve à busca por médico em 02.02 |
| Migration | `<timestamp>-authentication.ts` | — | uma por fase, escopo no nome |

### Código

| Tipo | Nome | Onde |
| --- | --- | --- |
| Token DI | `DOCTORS_REPOSITORY` · `REFRESH_TOKENS_REPOSITORY` | `shared/constants/repositories.ts` |
| Entity | `Doctor` · `RefreshToken` | `domains/domain/model-entities/` |
| Porta | `PasswordHasher` · `TokenIssuer` | `shared/interfaces/cryptography/` |
| Porta | `DoctorRepository` · `RefreshTokenRepository` | `domains/domain/repositories/` |
| Adapter | `BcryptPasswordHasher` · `JwtTokenIssuer` | `framework/cryptography/` |
| Adapter | `TypeOrmDoctorRepository` · `TypeOrmRefreshTokenRepository` | `infrastructure/…/repositories/` |
| Módulo | `CryptographyModule` · `AuthenticationModule` | respectivos diretórios |
| Service | `AuthenticateDoctorService` | `domains/domain/services/authentication/` |
| Controller | `AuthenticateDoctorController` | `gateways/http/controllers/domain/authentication/` |
| DTO | `AuthenticateDoctorDto` | `gateways/http/schemas/domain/authentication.schema.ts` |
| Presenter | `SessionPresenter` | `presentation/presenters/` |
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

Todo caminho parte de `api/`. Ordem: constantes → entity → migration → cripto →
porta → adapter → service → HTTP → seed → teste.

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Criar | `src/shared/constants/repositories.ts` — os 2 tokens (decisão 2) | NOVO | — |
| 2 | Criar | `src/domains/domain/model-entities/doctor.entity.ts` — **código no §contexto** | NOVO | — |
| 3 | Criar | `src/domains/domain/model-entities/refresh-token.entity.ts` — **código no §contexto** | NOVO | — |
| 4 | Editar | `src/domains/domain/model-entities/index.ts` — `[Doctor, RefreshToken]`, nesta ordem | ALTER | 2, 3 |
| **4b** | Editar | **os dois** DataSources — `uuidExtension: 'pgcrypto'` (decisão 13) | ALTER | — |
| 5 | Gerar | `npm run migration:generate --name=authentication` | NOVO | 4, 4b |
| 6 | **Revisar** | a migration gerada contra o SQL do §contexto; **acrescentar a FK à mão** no `up()` **e** no `down()` (decisão 4) | ALTER | 5 |
| 7 | Verificar | `migration:run` e `migration:run:test` aplicam nos dois bancos; conferir com `\d doctors` e `\d refresh_tokens` | — | 6 |
| 8 | Criar | `src/shared/interfaces/cryptography/password-hasher.ts` | NOVO | — |
| 9 | Criar | `src/shared/interfaces/cryptography/token-issuer.ts` — assinatura da decisão 3 | NOVO | — |
| 10 | Criar | `src/framework/cryptography/bcrypt-password-hasher.ts` — custo de `BCRYPT_ROUNDS` | NOVO | 8 |
| 11 | Criar | `src/framework/cryptography/jwt-token-issuer.ts` — JWT + `randomBytes` + SHA-256 | NOVO | 9 |
| 12 | Criar | `src/framework/cryptography/cryptography.module.ts` — exporta as duas portas | NOVO | 10, 11 |
| 13 | Criar | `src/domains/domain/repositories/doctor.repository.ts` — porta, `findByEmail` | NOVO | — |
| 14 | Criar | `src/domains/domain/repositories/refresh-token.repository.ts` — porta, só `create` | NOVO | — |
| 15 | Criar | `src/infrastructure/…/repositories/typeorm-doctor.repository.ts` | NOVO | 13, 2 |
| 16 | Criar | `src/infrastructure/…/repositories/typeorm-refresh-token.repository.ts` | NOVO | 14, 3 |
| 17 | Criar | `src/domains/domain/services/authentication/authenticate-doctor.service.ts` — devolve `Either` | NOVO | 8, 9, 13, 14 |
| 18 | Criar | `.../authentication/authentication.provider.ts` — adapters sob os tokens | NOVO | 15, 16 |
| 19 | Criar | `.../authentication/authentication.module.ts` — importa `CryptographyModule` | NOVO | 17, 18 |
| 20 | Criar | `src/gateways/http/schemas/domain/authentication.schema.ts` — Zod `.strict()` + normalização (decisão 6) | NOVO | — |
| 21 | Criar | `src/presentation/presenters/session.presenter.ts` — única via de saída (INV-07) | NOVO | — |
| 22 | Criar | `src/gateways/http/controllers/domain/authentication/authenticate-doctor.controller.ts` + `index.ts` | NOVO | 17, 20, 21 |
| 23 | Editar | `src/gateways/http/http.module.ts` — registra o controller, importa `AuthenticationModule` | ALTER | 19, 22 |
| 24 | Criar | `src/infrastructure/…/seeds/demo.seed.ts` — só o médico (decisões 10 e 11) | NOVO | 10, 15 |
| 25 | Criar | `…/authentication/authenticate-doctor.service.spec.ts` — in-memory + hasher falso | NOVO | 17 |
| 26 | Criar | `test/integration/authentication.e2e-spec.ts` — login ok, credencial inválida, INV-06, INV-07 | NOVO | 23 |

### Migrations

**Uma:** `<timestamp>-authentication.ts`, gerada, **revisada** e forward-only.
`down()` real, derrubando as duas tabelas na ordem inversa. A FK entra na revisão
(decisão 4) e o `down()` precisa refleti-la.

**Commits sugeridos** (PLAN §13 F2): `feat: entidades de medico e sessao` ·
`feat: migration de autenticacao` · `feat: portas de hash de senha e emissao de token` ·
`feat: login com access e refresh token`
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | Email inexistente | 401 `INVALID_CREDENTIALS` — **mesma** mensagem de senha errada | decisão 7 + spec |
| 2 | Senha errada | 401 `INVALID_CREDENTIALS` | spec |
| 3 | Email com caixa/espaço diferentes (` Medico@X.dev `) | Normalizado na borda; login funciona | decisão 6 + spec |
| 4 | Payload sem `password`, ou com campo extra | 400 `VALIDATION_ERROR` + `details[]` — o `APP_PIPE` já resolve | e2e |
| 5 | **O gerador não produz a FK** | A revisão a acrescenta; `down()` também | decisão 4 + checklist |
| 6 | `refresh_tokens.doctor_id` apontando para médico inexistente | O banco recusa — prova que a FK do passo 6 existe de fato | e2e |
| 7 | Refresh em claro no banco | **Nunca.** O e2e pega o `refreshToken` da resposta e afirma que ele não aparece em `refresh_tokens.token_hash`; o que está lá é o SHA-256 | INV-06, e2e |
| 8 | `password_hash` ou `token_hash` na resposta | **Nunca** — o presenter só expõe os três campos do contrato | INV-07, e2e |
| 9 | Seed rodado duas vezes | Falha em `uk_doctors_email`. **Declarado**, não tratado (decisão 11) | §decisoes |
| 10 | e2e sem schema no `prontomed_test` | Falha com `relation "doctors" does not exist` — o passo 7 previne | checklist |
| 11 | `expiresIn` da resposta | `900`, vindo de `expiresInSeconds` da porta — não de literal no controller | decisão 3 |
| 12 | `POST /auth/login` devolvendo 201 | **Não**: `@HttpCode(200)`, porque login não cria recurso | §contexto |
| 13 | `DEFAULT` do `id` na migration gerada | `gen_random_uuid()`. Se sair `uuid_generate_v4()`, o `uuidExtension` não foi aplicado — **não corrija o SQL à mão**, corrija o DataSource e regere | decisão 13 |
| 14 | Tempo de resposta de email inexistente vs. senha errada | Equivalente — o caminho "não existe" também paga um bcrypt | decisão 14 |
| 15 | Ordem dos `CREATE TABLE` na migration | `doctors` antes de `refresh_tokens`, senão a FK do passo 6 referencia tabela que ainda não existe | ordem do barril |

> Nada de INV-01, INV-02, INV-03 ou INV-05 aqui: não há agenda nem paciente. INV-04
> não entra porque não há rota autenticada até 02.02.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` + `test:e2e` — todos verdes
- [x] Login exercitado **à mão** no `/api/docs`, com a credencial do seed
- [x] `docker exec api-prontomed npm run seed` cria o médico

**Banco** (veto `[Database]`)
- [x] SQL gerado **revisado linha a linha** contra o DDL do §contexto
- [x] `pk_doctors` · `uk_doctors_email` · `pk_refresh_tokens` · `uk_refresh_tokens_hash` · `fk_refresh_tokens_doctors` · `idx_refresh_tokens_doctor` — todos com o nome exato, conferidos com `\d`
- [x] Nenhum nome inventado pelo gerador (`UQ_…`, `FK_…`, `PK_…`)
- [x] `id` com `DEFAULT gen_random_uuid()`, **não** `uuid_generate_v4()` (decisão 13)
- [x] `\dx` no banco **não** mostra `uuid-ossp` instalada por acidente
- [x] `token_hash` é `char(64)`; `expires_at`/`revoked_at`/`created_at` são `timestamptz`; `revoked_at` é o único nulo
- [x] A **FK foi acrescentada à mão** e o `down()` a desfaz
- [x] `down()` derruba as duas tabelas na ordem inversa e foi **testado** com `migration:revert`
- [x] Migration aplicada nos **dois** bancos

**Segurança** (veto `[Seguranca]`)
- [x] **INV-06:** o valor cru do refresh não está em lugar nenhum do banco — provado por consulta no e2e
- [x] **INV-07:** nenhuma resposta contém `password_hash` nem `token_hash`
- [x] Refresh gerado com `crypto.randomBytes(32)`, nunca `Math.random`/`uuid`
- [x] bcrypt com `BCRYPT_ROUNDS` (10), nunca hash rápido
- [x] Email inexistente e senha errada respondem **igual** — mesma mensagem e **mesmo custo de tempo** (decisão 14)
- [x] Nenhum log com email, senha ou token — só ID
- [x] `JWT_SECRET` lido do `EnvironmentService`, nunca literal

**Domínio e arquitetura**
- [x] O service não importa `typeorm`, `bcryptjs`, `@nestjs/jwt` nem `node:crypto` — sonda do lint continua reprovando
- [x] `RefreshToken` referencia `doctorId` **por ID**, sem `@ManyToOne` (ADR-04)
- [x] O service devolve `Either`, não lança; um único `execute`
- [x] O provider entrega o **adapter**, nunca `Repository<T>` cru
- [x] `AuthenticationModule` exporta o mínimo; `HttpModule` importa o módulo, não o token
- [x] Nenhuma transação no service

**Contrato**
- [x] `POST /api/auth/login` → **200** com `{ accessToken, refreshToken, expiresIn }`
- [x] `expiresIn` vem da porta, não de literal
- [x] A rota aparece em `/api/docs` com o schema derivado do Zod

**Plano**
- [x] `PLAN.md §8.4` corrigido com a assinatura da decisão 3
- [x] `PLAN.md §6.3` registra que a FK entre agregados entra na revisão (decisão 4)
- [x] `PLAN.md` Apêndice do DataSource registra o `uuidExtension` (decisão 13)
- [x] Nenhum teste depende do relógio real (decisão 15)
- [x] `PRODUCT.md §roadmap`: linha 02.01 → ✅, linha 02.02 criada
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PRÉ | **7/10 → 9/10** | ALTO (1) | REJECTED na 1ª passada: o gerador emite `uuid_generate_v4()` e o TypeORM instala `uuid-ossp` **por fora da migration** — efeito colateral fora do arquivo revisado, que o `down()` não desfaz, e schema divergente do §6.2. Re-scorado após a decisão 13, com as duas versões rodadas contra o banco. O mesmo experimento confirmou o resto: os 5 nomes de constraint saem exatos e a FK **não** é gerada, o que valida a decisão 4 com evidência em vez de suposição |
| `[Seguranca]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | INV-06 e INV-07 com asserção nomeada, `randomBytes`, bcrypt com custo de env, anti-enumeração por mensagem. MÉDIO: o caminho "email inexistente" pulava o bcrypt e respondia ~80× mais rápido — enumeração por cronômetro. Resolvido pela decisão 14 |
| `[Dominio]` | PRÉ | **9/10** | MÉDIO (1) | Agregados separados, referência por ID, uma escrita por transação, `Either` no retorno. MÉDIO: `expires_at` nasce de `new Date()` sem controle no teste — resolvido pela decisão 15 |
| `[Backend]` | PRÉ | **7/10 → 9/10** | ALTO (2) | REJECTED: o doc se dizia auto-contido sem trazer (a) o **código das entities** — e o gerador depende de cada decorator estar exato — e (b) **onde o `JwtModule` é registrado**, que é o ponto onde se erra lendo `process.env` fora do `EnvironmentService`. As duas caixas entraram no §contexto, a primeira com código já rodado contra o gerador |

**Conflitos entre agentes:** nenhum. Os 4 achados são independentes.

**Verificado na fricção PRÉ, não inferido** (laboratório no clone descartável, revertido ao fim):

```
migration:generate com as entities do §contexto
  → pk_doctors · uk_doctors_email · pk_refresh_tokens · uk_refresh_tokens_hash
    · idx_refresh_tokens_doctor   (todos com o nome exato)
  → character(64) em token_hash · TIMESTAMP WITH TIME ZONE · revoked_at nulo
  → NENHUMA foreign key            (confirma a decisão 4)
  → DEFAULT uuid_generate_v4()     (o ALTO do [Database])

migration:run  → \dx mostrou "uuid-ossp" instalada, sem nada na migration pedindo

com uuidExtension: 'pgcrypto'
  → DEFAULT gen_random_uuid()      (igual ao §6.2)
  → migration:run e migration:revert executam limpo
```

### Fricção PÓS

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Database]` | PÓS | **9/10** | BAIXO (1) | Os 6 nomes de constraint conferidos com `\d` nos **dois** bancos, exatos. `gen_random_uuid()` no `DEFAULT`, `char(64)` em `token_hash`, `timestamptz` em toda coluna de tempo, `revoked_at` o único nulo. `down()` testado de verdade (`migration:revert` → `migration:run`, ciclo completo). BAIXO: `CREATE INDEX` sem motivo em comentário — corrigido. O `-1` fica pelo issue 3: o efeito colateral de extensão era maior do que a fricção PRÉ mapeou |
| `[Seguranca]` | PÓS | **9/10** | ALTO (1) | INV-06 provado por consulta ao banco no e2e (o token cru não aparece em coluna nenhuma da linha); INV-07 por asserção sobre as chaves da resposta. `randomBytes(32)`, bcrypt com custo de env, `JWT_SECRET` só via `EnvironmentService`. Decisão 14 **medida**: 5 amostras de cada caminho de falha, ~87 ms nos dois — sem o hash descartável seria ~1 ms contra ~87 ms. ALTO: email em log no seed, corrigido |
| `[Backend]` | PÓS | **9/10** | — | Camadas limpas (lint verde), service sem ORM/cripto/transporte, um `execute`, `Either` no retorno, provider entregando o adapter, `AuthenticationModule` exportando só o service, controller fino com DTO Zod e presenter. O `-1` é o issue 4: a fronteira de lint precisou de exceção durante a implementação, e não na fricção PRÉ |
| `[QA]` | PÓS | **9/10** | MÉDIO (1) | 29 unitários + 27 e2e verdes. INV-06 e INV-07 com teste nomeado nas duas camadas; a FK exercitada por um caso que insere órfão e espera a recusa do banco pelo nome da constraint; `expiresIn` derivado do token, não de literal; fake timers no `expiresAt` (decisão 15); caminho de erro com o mesmo peso do feliz, inclusive a comparação byte a byte das duas respostas 401. MÉDIO: médico compartilhado entre casos, corrigido |

**Conflitos entre agentes:** nenhum.

**Gates no fechamento** (todos rodados em `docker exec api-prontomed`, que é onde as
dependências vivem — o `node_modules` do host está vazio):

```
typecheck  ✅   lint  ✅   build  ✅
test       ✅   4 suítes, 29 casos
test:e2e   ✅   5 suítes, 27 casos
migration  ✅   run → revert → run, nos dois bancos
seed       ✅   cria o médico; 2ª execução falha em uk_doctors_email (edge case 9)
login      ✅   200 com email em caixa alta e com espaços · 401 idêntico nos dois caminhos de falha
/api/docs  ✅   POST /api/auth/login com schema derivado do Zod e respostas 200/401
```
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| **1** | **`api/.env` não existia**, e o §contexto o dava como fato sob "não re-verificar" | O `.env` é gitignored: existia no clone onde a fricção PRÉ rodou, nunca neste diretório. "Fato verificado" que valia para *outra* árvore | `cp api/.env.example api/.env` (README:33) | `api/.env` | **Correção de doutrina:** "não re-verificar" não se aplica a estado de arquivo gitignored. Fato sobre a árvore de trabalho se verifica em toda sessão |
| **2** | Containers `api-prontomed`/`db-prontomed` de pé, mas do projeto compose `desafio-backend-afya` (`~/projects/tmp/`) | O clone descartável da fricção PRÉ ficou com os containers subidos, segurando os nomes | `docker compose -p desafio-backend-afya down` (sem `-v`) e `up -d` neste repo | — | Nota operacional: laboratório em clone precisa de `down` no fim, não só `git revert` |
| **3** | **O DataSource da *aplicação* também instala `uuid-ossp`** — não só o `migration:generate` | O TypeORM instala a extensão no `initialize()` ao ver coluna `uuid` gerada. Em watch mode, o Nest reiniciou entre o commit das entities e a edição do provider, e a extensão apareceu no banco de dev com `prontomed_test` limpo | `uuidExtension: 'pgcrypto'` no `database.providers.ts` **também** (o passo 4b já mandava, e é por isto que ele diz "os dois"). `DROP EXTENSION` + restart confirmou que não volta | `database.providers.ts` | **Extensão da decisão 13:** schema mudando porque alguém reiniciou o processo é o que `migrationsRun: false` existe para impedir. Virou armadilha em `PLAN.md §16.4` |
| **4** | O lint reprovou o **primeiro provider a existir**: `services/**` não pode importar `infrastructure/**` | Conflito entre a convenção do `CLAUDE.md` (`*.provider.ts` ao lado dos services) e o Apêndice C. O provider é composition root — `review-backend.md §verifica` **prescreve** `useFactory: (ds) => new TypeOrmXRepository(ds)`, que exige importar infra | `ignores` para `*.provider.ts` e `*.module.ts` no bloco de `services/**` | `eslint.config.mjs`, `PLAN.md` Apêndice C | Exceção declarada. **Preço:** regra de negócio num provider deixa de ser pega pelo lint; fica com o review `[Backend]` |
| **5** | O falso `hashRefreshToken` do spec retornava `` `sha256:${token}` `` — que **contém** o token cru | Falso infiel na única propriedade que o teste afirma: a de que o valor cru não sobrevive. A asserção de INV-06 era impossível de passar, por motivo nenhum do código real | Falso passou a devolver hex | `authenticate-doctor.service.spec.ts` | Lembrete: um falso precisa ser fiel **na propriedade sob teste**, não só na assinatura |
| **6** | `repository.delete({})` é recusado pelo TypeORM (`Empty criteria(s) are not allowed`) | API do TypeORM, não do projeto | `TRUNCATE TABLE refresh_tokens, doctors` — as duas juntas, senão a FK barra a primeira | `authentication.e2e-spec.ts` | — |
| **7** | O checklist manda registrar o `uuidExtension` no "**Apêndice do DataSource**" do `PLAN.md` — **esse apêndice não existe** | O sprint-doc supôs uma seção pelo nome, sem conferir | Registrado onde de fato cabe: `§16.2` (item 7) e `§16.4` | `PLAN.md` | Mesmo padrão do issue 1: referência a documento afirmada sem verificação |
| **8** | O seed terminava **em silêncio** | `logger: ['error','warn']` engolia o próprio `logger.log` de confirmação | `'log'` incluído no array | `demo.seed.ts` | — |

### Achados da fricção PÓS (corrigidos antes do fechamento)

| Agente | Severidade | Achado | Correção |
| --- | --- | --- | --- |
| `[Seguranca]` | **ALTO** | O seed logava o **email** do médico. `review-security.md §verifica` item 3 trata PII em log como ALTO, e o §checklist desta sprint diz "só ID" — violado pela própria implementação | Loga o `id` retornado pelo `insert` |
| `[QA]` | MÉDIO | O médico do e2e nascia no `beforeAll` e era compartilhado por 12 casos — `review-testing.md §regras` proíbe compartilhar registro entre testes | `TRUNCATE` + `insert` no `beforeEach`; o hash bcrypt fica no `beforeAll` (valor imutável, ~80 ms uma vez só) |
| `[Database]` | BAIXO | `CREATE INDEX` sem **motivo declarado em comentário na migration** (`§regras`/Índices) — o motivo estava só na entity | Comentário na migration: performance, servindo à revogação por médico de 02.02 |

> Preencher **durante** a sprint, não no fechamento.
<!-- /§issues -->
