# Sprint 02.02 — Rotas protegidas e ciclo de sessão (F2, parte 2 de 2)

> Sumário:
> - §contexto — **auto-contido**: o que 02.01 deixou pronto, as APIs de terceiro verificadas e as assinaturas fixadas para copiar
> - §objetivo — toda rota nasce autenticada; renovar, encerrar e ler o próprio perfil
> - §decisoes — 22 decisões; duas divergem do plano e o corrigem, seis nasceram da fricção PRÉ
> - §nomes — 3 services, 3 controllers, 2 presenters, os arquivos do guard
> - §escopo — 23 passos: porta → adapter → guard → service → HTTP → teste
> - §edge-cases — 20 casos, com destaque para o que o guard e o logout deixam passar por definição
> - §checklist — o gate pré-fechamento
> - §scores — fricção PRÉ e PÓS
> - §issues — o que aparecer durante a implementação
>
> **Plano canônico:** [PLAN.md §13 — F2](../../PLAN.md) · **Estado:** [PRODUCT.md §roadmap](../../PRODUCT.md) · **Formato:** [SPRINT-TEMPLATE.md](../../SPRINT-TEMPLATE.md)

**Branch:** `main` · **Início:** 2026-08-08 · **Fase:** F2 (parte 2 de 2)
**Status:** ✅ fechada em 2026-08-08 — **fricção PRÉ e PÓS aprovadas** (9/10 nos cinco agentes em ambas). 4 issues registrados; 1 item do checklist deliberadamente não marcado, com a razão no issue 3
**Triagem:** COMPLEXO (≈18 arquivos, guard global, INV-04 entra em vigor) → plano + fricção PRÉ ≥9/10 + aprovação + implementar + fricção PÓS
**Agentes:** `[Backend]` `[Dominio]` (no limite) · `[Seguranca]` (auth, obrigatório) · `[Produto]` (3 rotas novas, obrigatório) · `[QA]` (fecha a fase F2, obrigatório)

---

<!-- §contexto -->
## Contexto embutido — o que já existe e o que falta

### Pronto em 02.01 (verificado no repositório, não suposto)

| Peça | Arquivo | Estado |
| --- | --- | --- |
| Entities | `model-entities/{doctor,refresh-token}.entity.ts` | prontas; `RefreshToken` tem `revokedAt: Date \| null` |
| Migration | `migrations/1786106607670-authentication.ts` | aplicada, forward-only — **esta sprint não gera migration** |
| Porta de senha | `shared/interfaces/cryptography/password-hasher.ts` | completa |
| Porta de token | `shared/interfaces/cryptography/token-issuer.ts` | **só emite** — não verifica (decisão 1) |
| Porta de médico | `domains/domain/repositories/doctor.repository.ts` | só `findByEmail` |
| Porta de sessão | `domains/domain/repositories/refresh-token.repository.ts` | só `create` |
| Caso de uso | `services/authentication/authenticate-doctor.service.ts` | login pronto |
| Módulo | `services/authentication/authentication.module.ts` | importa `CryptographyModule`, exporta só o service |
| Filtro | `framework/filters/errors/exception-filter.ts` | já mapeia `UNAUTHENTICATED` e `INVALID_REFRESH_TOKEN` → 401 |
| Erros | `shared/errors/types/index.ts` | `UnauthenticatedError` e `InvalidRefreshTokenError` **já existem**, sem ninguém que os lance |
| Rotas | `POST /api/auth/login` · `GET /api/health` | ambas abertas — não há guard |

### O que o contrato manda (PLAN §8.2, §9.1)

```
POST /api/auth/refresh { refreshToken }
  ├─ hash inexistente, expirado ou revogado . 401 INVALID_REFRESH_TOKEN
  └─ válido → novo access token; o refresh segue valendo até expirar
              200 { accessToken, expiresIn: 900 }

POST /api/auth/logout  { refreshToken } → 204 sempre (revoga se achar, cala se não)
GET  /api/auth/me      (Bearer)         → 200 { id, name, email } · 401 sem token
```

### A porta de sessão, completa (PLAN §8.3)

```ts
export interface RefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<void>;         // 02.01
  findValidByHash(hash: string): Promise<RefreshToken | null>; // não expirado, não revogado
  revokeByHash(hash: string): Promise<void>;                   // logout, idempotente
}
```

### Ordem de execução do Nest — o que decide o status de uma requisição

```
guard  →  interceptor  →  pipe  →  controller
```

Consequência direta: numa rota protegida, **payload inválido responde 401, não 400** —
o guard roda antes do `APP_PIPE`. É comportamento correto (não se valida corpo de
quem não se sabe quem é), e precisa estar no e2e para não ser lido como bug depois.

### API de terceiro — verificado no container, não suposto

```
docker exec api-prontomed  ·  @nestjs/core 10.4.15 · @nestjs/jwt 10.2.0 · typeorm 0.3.20

JwtService.verifyAsync<T extends object>(token, options?): Promise<T>   ← lança em token ruim
Reflector.getAllAndOverride<T>(metadataKey, targets: (Type|Function)[]): T
DiscoveryService.getControllers(options?, modules?): InstanceWrapper[]  ← precisa de DiscoveryModule
MetadataScanner.getAllMethodNames(prototype: object | null): string[]
```

`verifyAsync` sem `options` usa o segredo do `JwtModule.registerAsync` — o mesmo
caminho que o `signAsync` de 02.01 já exercita. Nenhum segredo é lido no guard.

### Assinaturas fixadas — copiar, não reinventar

**Passo 1 — a porta ganha verificação** (`shared/interfaces/cryptography/token-issuer.ts`):

```ts
export abstract class TokenIssuer {
  abstract issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken>;
  abstract generateRefreshToken(): string;
  abstract hashRefreshToken(token: string): string;

  /** `null` para token ausente, malformado, expirado ou de assinatura errada (decisão 2). */
  abstract verifyAccessToken(token: string): Promise<AccessTokenPayload | null>;
}
```

**Passo 2 — o adapter** (`framework/cryptography/jwt-token-issuer.ts`):

```ts
async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    // Devolve só o que o payload publica: `exp` e `iat` ficam no token, não sobem.
    const { sub, email } = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    return { sub, email };
  } catch {
    return null;
  }
}
```

**Passos 3 e 4 — as portas de repositório:**

```ts
// domains/domain/repositories/doctor.repository.ts
findById(id: string): Promise<Doctor | null>;

// domains/domain/repositories/refresh-token.repository.ts
/** O parâmetro é o SHA-256 hex. O valor cru nunca chega aqui (decisão 17). */
findValidByHash(hash: string): Promise<RefreshToken | null>;
revokeByHash(hash: string): Promise<void>;
```

**Passo 6 — o adapter de sessão** (`typeorm-refresh-token.repository.ts`). O relógio
é o do banco (decisão 9), e é por isso que são `QueryBuilder` e não `findOne`:
`MoreThan(new Date())` traria o relógio do processo de volta.

```ts
async findValidByHash(hash: string): Promise<RefreshToken | null> {
  return this.repository
    .createQueryBuilder('refreshToken')
    .where('refreshToken.tokenHash = :hash', { hash })
    .andWhere('refreshToken.revokedAt IS NULL')
    .andWhere('refreshToken.expiresAt > now()')
    .getOne();
}

async revokeByHash(hash: string): Promise<void> {
  await this.repository
    .createQueryBuilder()
    .update(RefreshToken)
    // `() => 'now()'` grava o instante do banco, não o do processo.
    .set({ revokedAt: () => 'now()' })
    // Sem alias no UPDATE: aqui o nome é o da coluna, não o da propriedade.
    .where('token_hash = :hash', { hash })
    .andWhere('revoked_at IS NULL')
    .execute();
}
```

> No `SELECT` o nome é o da **propriedade** (`refreshToken.tokenHash`) porque o
> alias existe; no `UPDATE` é o da **coluna** (`token_hash`) porque não existe.
> Trocar um pelo outro compila e falha em runtime.

**Passos 7 a 9 — o guard e os dois decorators** (`framework/authentication/`):

```ts
// authenticated-doctor.ts — a forma que o guard escreve e o decorator lê.
export interface AuthenticatedDoctor { id: string; email: string; }

/** Só o que o guard precisa do request. Espelha o `HttpResponse` do exception-filter:
 *  o transporte concreto não entra em `framework/`. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  doctor?: AuthenticatedDoctor;
}

// public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

// jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenIssuer: TokenIssuer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler antes da classe: um método `@Public()` abre mesmo em controller fechado.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Nenhuma ida ao banco (decisão 5): assinatura e expiração, e nada mais.
    const payload = await this.tokenIssuer.verifyAccessToken(this.extractBearer(request));

    if (!payload) throw new UnauthenticatedError('Autenticação necessária.');

    request.doctor = { id: payload.sub, email: payload.email };
    return true;
  }

  /** Parse estrito: header ausente, sem `Bearer ` ou com prefixo trocado vira `''`,
   *  que a porta rejeita como qualquer outro token inválido. */
  private extractBearer(request: AuthenticatedRequest): string {
    const header = request.headers.authorization;
    if (typeof header !== 'string') return '';
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : '';
  }
}

// current-doctor.decorator.ts
export const CurrentDoctor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Só acontece se alguém usar o decorator numa rota `@Public()`: falha alto,
    // no primeiro clique, em vez de devolver `undefined` como se fosse um médico.
    if (!request.doctor) throw new UnauthenticatedError('Autenticação necessária.');
    return request.doctor.id;
  },
);
```

**Passos 10 a 12 — os três casos de uso.** Assinaturas completas; o corpo é a
sequência descrita nas decisões 17, 11, 15 e 22.

```ts
// refresh-session.service.ts
export type RefreshSessionResult = Either<
  InvalidRefreshTokenError | UnauthenticatedError,
  { accessToken: string; expiresIn: number }
>;
execute({ refreshToken }: { refreshToken: string }): Promise<RefreshSessionResult>
//  1. hash = tokenIssuer.hashRefreshToken(refreshToken)      ← decisão 17
//  2. session = findValidByHash(hash) → null ⇒ left(InvalidRefreshTokenError(
//       'Sessão expirada. Faça login novamente.'))
//  3. doctor = doctorRepository.findById(session.doctorId) → null ⇒ left(
//       UnauthenticatedError('Autenticação necessária.'))              ← decisão 15
//  4. right(issueAccessToken({ sub: doctor.id, email: doctor.email }))
//     O refresh NÃO é reemitido nem tocado (ADR-11).

// revoke-session.service.ts — sem Either (decisão 19)
execute({ refreshToken }: { refreshToken: string }): Promise<void>
//  hash → revokeByHash(hash). Não pergunta se achou.

// get-profile.service.ts
export interface DoctorProfile { id: string; name: string; email: string; }
export type GetProfileResult = Either<UnauthenticatedError, DoctorProfile>;
execute({ doctorId }: { doctorId: string }): Promise<GetProfileResult>
//  findById → null ⇒ left(UnauthenticatedError(...)); senão right(DoctorProfile)
//  Devolve DoctorProfile, NUNCA a entity Doctor — ela carrega passwordHash (decisão 22).
```

**Passos 14 a 17 — borda HTTP:**

```ts
// authentication.schema.ts (ALTER) — um schema para refresh e logout (decisão 16)
export const refreshTokenSchema = z
  .object({
    refreshToken: z
      .string({ required_error: 'O token de sessão é obrigatório.' })
      .min(1, 'O token de sessão é obrigatório.'),
  })
  .strict();
export class RefreshTokenDto extends createZodDto(refreshTokenSchema) {}

// presenters
AccessTokenPresenter.toHttp({ accessToken, expiresIn })  → { accessToken, expiresIn }
DoctorPresenter.toHttp(profile)                          → { id, name, email }

// controllers — o essencial de cada um
@Public() @Post('refresh') @HttpCode(HttpStatus.OK)        // 200
@Public() @Post('logout')  @HttpCode(HttpStatus.NO_CONTENT) // 204, retorno `void`
@ApiBearerAuth() @Get('me')                                 // 200, @CurrentDoctor()
```

**Passo 20 — `http.module.ts`:**

```ts
@Module({
  // CryptographyModule entra porque o APP_GUARD é instanciado NESTE módulo e
  // injeta TokenIssuer. O JwtModule continua invisível fora do CryptographyModule.
  imports: [AuthenticationModule, CryptographyModule],
  controllers: [HealthController, AuthenticateDoctorController, RefreshSessionController,
                RevokeSessionController, GetProfileController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
```

**Passo 21b — a varredura** (`test/integration/public-routes.e2e-spec.ts`):

```ts
const moduleRef = await Test.createTestingModule({
  imports: [AppModule, DiscoveryModule],   // DiscoveryModule é quem provê o service
}).compile();

const publicHandlers = discovery.getControllers().flatMap((wrapper) => {
  const prototype = Object.getPrototypeOf(wrapper.instance);
  return scanner
    .getAllMethodNames(prototype)
    .filter((method) => reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      prototype[method] as Function,
      wrapper.metatype as Type,
    ]))
    .map((method) => `${wrapper.name}.${method}`);
});

// Quatro, e exatamente estes. `GetProfileController.handle` fora da lista é o
// ponto do teste: se alguém marcar `me` como pública, a suíte reprova.
expect(publicHandlers.sort()).toEqual([
  'AuthenticateDoctorController.handle',
  'HealthController.handle',
  'RefreshSessionController.handle',
  'RevokeSessionController.handle',
]);
```

> A lista é **igualdade**, não `toContain`: rota pública a mais reprova, rota
> pública a menos também. É o único formato em que esquecer de fechar uma rota
> nova quebra a suíte.
<!-- /§contexto -->

---

<!-- §objetivo -->
## Objetivo

Fechar F2: a partir daqui **toda rota nasce autenticada** e as três operações que
faltam do ciclo de sessão existem — renovar o access sem repetir senha, encerrar a
sessão de verdade e ler o próprio perfil.

É a sprint que torna o resto do sistema possível: F3, F4 e F5 dependem inteiramente
de `@CurrentDoctor()`, porque INV-04 diz que toda leitura e escrita é escopada pelo
médico do token. Nenhum paciente pode ser cadastrado antes disto existir.

**Módulos impactados:** nasce `framework/authentication/`. Tocam
`AuthenticationModule` (3 services novos), `HttpModule` (o `APP_GUARD`), as duas
portas de repositório, `presentation/presenters` e o schema de autenticação.

**Risco principal:** o **default** do guard. Um guard que erra para o lado aberto
não quebra teste nenhum — a suíte fica verde e a API fica exposta. É por isso que o
gate desta sprint inclui um e2e que varre as rotas registradas e exige 401 em toda
que não estiver marcada `@Public()`.
**Risco número dois:** INV-04 entra em vigor aqui. Se qualquer controller aceitar
`doctorId` vindo do payload em vez do token, F3 nasce com IDOR e o defeito se
espalha por três fases antes de aparecer.

**Agentes obrigatórios e por qual gatilho:** `[Seguranca]` (toca auth) ·
`[Produto]` (3 rotas novas) · `[QA]` (fecha a fase F2). `[Database]` **não** entra:
não há migration, entity nem constraint nesta sprint — só duas consultas novas sobre
schema existente.

**Fora do escopo desta sprint:**

| Item | Vai para |
| --- | --- |
| Rotação de refresh, família de tokens, detecção de reuso | **DEBT-11** — fica declarado, não se implementa |
| Rate limiting no login e no refresh | DEBT-07 |
| Limpeza de refresh tokens expirados | DEBT-06 |
| `refreshToken` em cookie `httpOnly` | DEBT-04 |
| Papéis, permissões, qualquer autorização além de "é o dono" | DEBT-08 |
| Pacientes, agenda, anotações | 03.01 em diante |
<!-- /§objetivo -->

---

<!-- §decisoes -->
## Decisões de execução

| # | Decisão | Escolha | Rationale | Alternativa descartada |
| --- | --- | --- | --- | --- |
| **1** | Quem verifica o access token | **`TokenIssuer.verifyAccessToken()`** — método novo na porta, divergindo de `PLAN.md §8.4` | A porta emite mas não verifica, e o guard precisa verificar. Sem o método, o guard importa `@nestjs/jwt` direto e o `CryptographyModule` deixa de ser o único lugar que conhece a lib — a regra que faz "trocar de algoritmo" ser um arquivo, não uma caçada | `CryptographyModule` exportar o `JwtModule`: espalha a lib por quem só quer um payload |
| 2 | Forma do retorno de `verifyAccessToken` | **`Promise<AccessTokenPayload \| null>`** — `null` para inválido, expirado ou assinatura errada | Token inválido é resultado **esperado** de uma requisição pública mal formada, não defeito. Quem decide o erro HTTP é o guard, não o adapter | `throw` do `@nestjs/jwt` vazando `TokenExpiredError` para o guard: erro de lib como fluxo de controle |
| **3** | Default do guard | `JwtAuthGuard` como **`APP_GUARD`** no `HttpModule`: toda rota nasce fechada; `@Public()` abre | Esquecer `@UseGuards` num controller é silencioso e a suíte não denuncia. Esquecer `@Public()` produz 401 numa rota que devia ser aberta — barulhento, pego no primeiro clique | `@UseGuards` por controller: o modo em que o erro é invisível |
| 4 | Quem é `@Public()` | `health`, `login`, `refresh` e **`logout`** | Os três de sessão não podem exigir sessão: `refresh` existe porque o access expirou, e `logout` precisa funcionar **justamente** quando o access já morreu. `/api/docs` não é rota do Nest (é middleware do Swagger) e o guard não a alcança — a ser confirmado no passo 20, não suposto | Logout autenticado: obriga quem quer sair a renovar antes, e a sessão fica viva por não conseguir morrer |
| 5 | O guard **não** vai ao banco | Verifica assinatura e expiração, e mais nada | O access é auto-validável — essa é a razão de ele ser JWT. Uma consulta por requisição para conferir o `sub` transformaria os 15 min de TTL numa ida ao banco em toda rota da API | Checar o médico na tabela a cada request: custo permanente para cobrir um caso que não existe (não há endpoint que apague médico — DEBT-08) |
| 6 | Preço declarado da nº 5 | Médico apagado (ou desativado, quando existir) continua entrando por até 15 min | É o preço conhecido de token auto-validável, e é por isso que o **refresh** é opaco: o que dá poder de corte é a revogação da sessão, não a checagem do access | Fingir que não existe |
| 7 | O que o guard põe no request | `request.doctor = { id, email }`; **`@CurrentDoctor()` devolve o `id`** | `PLAN.md §8.5`: nenhum service lê `request`. O controller recebe `doctorId: string` e passa por parâmetro — INV-04 depende de a origem do escopo ser **uma só** | Devolver o objeto inteiro: convida o controller a confiar em campo do token como se fosse dado do banco |
| 8 | Erro do guard | Lança **`UnauthenticatedError`** (`DomainError` do catálogo), não `UnauthorizedException` do Nest | O filtro já mapeia `UNAUTHENTICATED` → 401 com envelope e mensagem PT-BR. Deixar o Nest lançar produziria o mesmo status por outro caminho — e um `code` vindo do fallback por status, não do catálogo | `UnauthorizedException`: funciona hoje por coincidência de mapeamento |
| 9 | Filtro de validade do refresh | **No SQL**: `revoked_at IS NULL AND expires_at > now()`, relógio do **banco** | Uma fonte de tempo só. Trazer a linha e decidir em JS abriria a janela entre `SELECT` e comparação, e faria o relógio do processo divergir do que a coluna gravou | Comparar em JS: dois relógios para uma pergunta só |
| 10 | Consequência de teste da nº 9 | O e2e de refresh expirado **insere a linha com `expires_at` no passado**; fake timers não entram aqui | Fake timer move o relógio do processo, não o do Postgres. Um teste que finge o contrário passa por engano | `jest.useFakeTimers()` no e2e de expiração: verde por motivo errado |
| 11 | `revokeByHash` | `UPDATE … SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, retorno `void` | Logout responde 204 **sempre** (`PRODUCT.md §regras`): distinguir "revoguei" de "não achei" seria um oráculo de "este token existe". O `AND revoked_at IS NULL` preserva o instante da primeira revogação | Ler antes para decidir: duas idas ao banco para produzir a mesma resposta |
| 12 | Três services, não um | `RefreshSessionService` · `RevokeSessionService` · `GetProfileService`, um `execute` cada | Padrão do projeto (`CLAUDE.md §Convenções`): um caso de uso por classe. `SessionService.refresh/revoke/profile` é o começo do service-balde | Um service de sessão com três métodos |
| 13 | O que `refresh` devolve | **Só** `{ accessToken, expiresIn }`, via `AccessTokenPresenter` próprio | Sem rotação (ADR-11) o refresh não muda — devolvê-lo de novo sugeriria que mudou, e o cliente guardaria um valor "novo" idêntico ao antigo. `SessionPresenter` não serve: `refreshToken` é obrigatório nele | Reusar `SessionPresenter` devolvendo o mesmo refresh: contrato mentindo sobre rotação |
| 14 | `me` vai ao banco | `GetProfileService` usa **`DoctorRepository.findById`** | O `name` não está no token, e colocá-lo lá inflaria o JWT e criaria uma cópia que envelhece — o médico troca o nome e o token continua dizendo o antigo por 15 min | Servir `me` do payload do token: barato e errado |
| 15 | Token válido cujo `sub` não existe mais | **401 `UNAUTHENTICATED`**, não 404 | O recurso ausente aqui é o **dono da sessão**, não um recurso alheio: INV-04 e o 404 dela falam de dado de outro médico. Dizer 404 no próprio perfil descreveria mal o que houve — a sessão é que não vale mais | 404 `RESOURCE_NOT_FOUND`: mesma resposta que "paciente não é seu", para um caso de natureza oposta |
| 16 | Schema do corpo de refresh e logout | **Um** schema Zod `.strict()`, `RefreshTokenDto`, usado pelos dois controllers | O corpo é literalmente o mesmo campo. Dois schemas idênticos divergem no dia em que um for editado | Um schema por rota, por simetria de arquivo |
| **17** | Onde o refresh cru vira hash | **No service**, antes de chamar a porta — igual ao login de 02.01. As duas assinaturas novas recebem o parâmetro chamado `hash`, não `token` | INV-06 é a invariante mais cara desta parte do sistema, e ela se perde por descuido de uma linha: passar o valor cru para `findValidByHash` faz a busca nunca achar (401 permanente), e o "conserto" óbvio de quem não conhece a regra é gravar o cru. O nome do parâmetro é a primeira barreira | Hashear no adapter: o service passaria a manusear o cru sem motivo, e a porta deixaria de dizer o que aceita |
| **18** | O que o logout **não** faz | Revoga o refresh; o **access corrente continua válido até expirar** (≤ 15 min) | Consequência direta da decisão 5 — access auto-validável não é revogável sem lista de bloqueio, e uma lista de bloqueio é um segundo estado de sessão para manter, invalidar e testar. O que o logout garante é que a sessão **não se renova**: em ≤ 15 min ela morre sozinha | Blacklist de access tokens: reintroduz a consulta por requisição que a decisão 5 recusa, para encurtar uma janela de 15 minutos |
| **19** | Retorno do `RevokeSessionService` | `Promise<void>` — **sem `Either`** | `Either` existe para obrigar quem chama a tratar o erro esperado. Logout não tem erro esperado (decisão 11): o `Left` seria de tipo `never`, ruído que ensina o padrão errado para as próximas fases | `Either<never, void>` por simetria com os outros services |
| **20** | Como a varredura de rotas é feita | `DiscoveryService` do `@nestjs/core` enumera os handlers e o teste afirma que o conjunto marcado com `IS_PUBLIC_KEY` é **exatamente** o esperado | É metadado do Nest, API pública e estável. Vasculhar `_router` do Express prova a mesma coisa acoplado à versão do transporte — o teste quebraria numa atualização sem nenhum defeito no produto | Lista fixa de rotas no e2e: rota nova esquecida na lista não é detectada, que é exatamente o caso que se quer pegar |
| **21** | Texto das duas respostas 401 | `UNAUTHENTICATED` → **"Autenticação necessária."** · `INVALID_REFRESH_TOKEN` → **"Sessão expirada. Faça login novamente."** | O primeiro já é o texto que o filtro usa para 401 por status; o segundo é o de `PRODUCT.md §regras`. Fixar aqui evita a API responder o mesmo 401 com dois textos, conforme quem lançou | Deixar o texto para a implementação escolher |
| **22** | O que `GetProfileService` devolve | **`DoctorProfile` (`{ id, name, email }`)** — nunca a entity `Doctor` | `review-domain.md §verifica`/INV-07 cobra que nenhum campo sensível escape pelo **retorno do caso de uso**, não só pela resposta HTTP. A entity carrega `passwordHash`: devolvê-la ao controller faz o presenter virar a única defesa, e presenter é o lugar onde se esquece de tirar um campo | Devolver a entity e confiar no presenter: uma camada de defesa em vez de duas, para economizar três linhas |

> A **nº 1** altera contrato de código (`PLAN.md §8.4`) e é corrigida no plano no
> fechamento — mesmo tratamento da decisão 3 de 02.01. Não vira ADR: não muda
> agregado, invariante nem contrato externo. A **nº 15** é decisão de **produto**
> (o que o cliente vê) sobre um caminho que hoje é inalcançável — registrada agora
> porque o dia em que houver exclusão de médico é tarde para decidir.
<!-- /§decisoes -->

---

<!-- §nomes -->
## Nomes fixados

| Tipo | Nome | Onde |
| --- | --- | --- |
| Guard | `JwtAuthGuard` | `framework/authentication/jwt-auth.guard.ts` |
| Decorator | `@Public()` + `IS_PUBLIC_KEY` | `framework/authentication/public.decorator.ts` |
| Decorator | `@CurrentDoctor()` | `framework/authentication/current-doctor.decorator.ts` |
| Método de porta | `TokenIssuer.verifyAccessToken` | `shared/interfaces/cryptography/token-issuer.ts` (ALTER) |
| Método de porta | `DoctorRepository.findById` | `domains/domain/repositories/doctor.repository.ts` (ALTER) |
| Método de porta | `RefreshTokenRepository.findValidByHash` · `revokeByHash` | `domains/domain/repositories/refresh-token.repository.ts` (ALTER) |
| Service | `RefreshSessionService` · `RevokeSessionService` · `GetProfileService` | `domains/domain/services/authentication/` |
| Controller | `RefreshSessionController` · `RevokeSessionController` · `GetProfileController` | `gateways/http/controllers/domain/authentication/` |
| DTO | `RefreshTokenDto` | `gateways/http/schemas/domain/authentication.schema.ts` (ALTER) |
| Presenter | `AccessTokenPresenter` · `DoctorPresenter` | `presentation/presenters/` |
| Tipo | `AuthenticatedDoctor` (`{ id, email }`) | `framework/authentication/` — **um** arquivo declara a forma que o guard escreve e o decorator lê; contrato implícito entre os dois é como se perde o `id` |

**Banco:** nenhum nome novo. Nenhuma migration nesta sprint.

> **Dois repositórios no mesmo caso de uso** (`RefreshSessionService` lê sessão e
> médico) **não** fura ADR-04: `Doctor` e `RefreshSession` são agregados distintos,
> mas do **mesmo módulo** — `AuthenticationModule` é dono dos dois. A regra que
> proíbe alcançar repositório alheio vale entre módulos. E a leitura de dois
> agregados nunca foi o problema: o proibido é **escrever** em dois.
<!-- /§nomes -->

---

<!-- §escopo -->
## Escopo — plano ordenado

Todo caminho parte de `api/`. Ordem: porta → adapter → guard → service → HTTP → teste.

| # | Ação | Arquivo | Tipo | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Editar | `src/shared/interfaces/cryptography/token-issuer.ts` — `verifyAccessToken` (decisões 1 e 2) | ALTER | — |
| 2 | Editar | `src/framework/cryptography/jwt-token-issuer.ts` — implementa; `verifyAsync` com `catch → null` | ALTER | 1 |
| 3 | Editar | `src/domains/domain/repositories/doctor.repository.ts` — `findById` | ALTER | — |
| 4 | Editar | `src/domains/domain/repositories/refresh-token.repository.ts` — `findValidByHash` + `revokeByHash` | ALTER | — |
| 5 | Editar | `.../repositories/typeorm-doctor.repository.ts` — `findById` | ALTER | 3 |
| 6 | Editar | `.../repositories/typeorm-refresh-token.repository.ts` — as duas, com o filtro no SQL (decisões 9 e 11) | ALTER | 4 |
| 7 | Criar | `src/framework/authentication/public.decorator.ts` | NOVO | — |
| 8 | Criar | `src/framework/authentication/current-doctor.decorator.ts` (decisão 7) | NOVO | — |
| 9 | Criar | `src/framework/authentication/jwt-auth.guard.ts` — `Reflector` + `TokenIssuer` (decisões 3, 5, 8) | NOVO | 1, 7 |
| 10 | Criar | `src/domains/domain/services/authentication/refresh-session.service.ts` | NOVO | 2, 3, 4 |
| 11 | Criar | `src/domains/domain/services/authentication/revoke-session.service.ts` | NOVO | 4 |
| 12 | Criar | `src/domains/domain/services/authentication/get-profile.service.ts` — devolve `DoctorProfile`, não a entity (decisão 22) | NOVO | 3 |
| 13 | Editar | `.../authentication/authentication.module.ts` — registra e exporta os 3 services | ALTER | 10, 11, 12 |
| 14 | Editar | `src/gateways/http/schemas/domain/authentication.schema.ts` — `RefreshTokenDto` (decisão 16) | ALTER | — |
| 15 | Criar | `src/presentation/presenters/access-token.presenter.ts` (decisão 13) | NOVO | — |
| 16 | Criar | `src/presentation/presenters/doctor.presenter.ts` | NOVO | — |
| 17 | Criar | os 3 controllers em `.../controllers/domain/authentication/` + `index.ts` (ALTER) | NOVO | 10–16 |
| 18 | Editar | `src/gateways/http/controllers/core/health.controller.ts` — `@Public()` | ALTER | 7 |
| 19 | Editar | `src/gateways/http/controllers/domain/authentication/authenticate-doctor.controller.ts` — `@Public()` | ALTER | 7 |
| 20 | Editar | `src/gateways/http/http.module.ts` — `APP_GUARD`, importa `CryptographyModule`, registra os 3 controllers; **conferir no navegador** que `/api/docs` continua abrindo (decisão 4) | ALTER | 9, 17 |
| 21 | Criar | 3 `*.spec.ts` ao lado dos services + `jwt-auth.guard.spec.ts` | NOVO | 9–12 |
| 21b | Criar | `test/integration/public-routes.e2e-spec.ts` — varredura por `DiscoveryService` (decisão 20) | NOVO | 20 |
| 22 | Editar | `test/integration/authentication.e2e-spec.ts` — o bloco de sessão de `PLAN.md §12.4` + os edge cases 15, 18 e 19 | ALTER | 20 |

### Migrations

**Nenhuma.** As duas consultas novas caem sobre `uk_refresh_tokens_hash` (busca por
hash) e sobre a PK (busca por médico) — índices que a migration de 02.01 já criou.

**Commits sugeridos** (linguagem de 02.01 em diante — direta, para quem lê o produto):
`feat: verificacao de token na porta de criptografia` ·
`feat: toda rota nasce autenticada` ·
`feat: renovar sessao sem repetir senha` ·
`feat: logout encerra a sessao de verdade` ·
`feat: perfil do medico autenticado` ·
`test: ciclo completo de sessao`
<!-- /§escopo -->

---

<!-- §edge-cases -->
## Edge cases

| # | Caso | Comportamento esperado | Coberto por |
| --- | --- | --- | --- |
| 1 | Rota protegida **sem** header `Authorization` | 401 `UNAUTHENTICATED` | guard + e2e |
| 2 | Header sem o prefixo `Bearer `, ou com prefixo trocado | 401 — o parse é estrito | guard + e2e |
| 3 | JWT expirado | 401 `UNAUTHENTICATED` | decisão 2 + e2e |
| 4 | JWT assinado com **outro segredo** | 401 — e o teste prova que a assinatura é verificada, não só o formato | e2e |
| 5 | JWT com payload adulterado (`sub` de outro médico) | 401, pela assinatura quebrada | e2e |
| 6 | **Rota nova sem `@Public()` e sem intenção de ser pública** | 401 — é o default. A varredura de rotas do e2e é o que denuncia o inverso | decisão 3 + e2e |
| 7 | `POST /auth/logout` **sem** token de acesso | 204 — logout é público (decisão 4) | e2e |
| 8 | Logout com refresh desconhecido, já revogado ou expirado | **204 nas três** | decisão 11 + e2e |
| 9 | Logout duas vezes com o mesmo token | 204 nas duas; `revoked_at` **não muda** na segunda | decisão 11 + e2e |
| 10 | Refresh com token válido | 200 `{ accessToken, expiresIn }`, **sem** `refreshToken` no corpo | decisão 13 + e2e |
| 11 | Refresh **depois** do logout | 401 `INVALID_REFRESH_TOKEN` | e2e (§12.4) |
| 12 | Refresh com `expires_at` no passado | 401 — linha inserida com data passada, não fake timer | decisões 9 e 10 + e2e |
| 13 | Dois refresh concorrentes com o mesmo token | **Dois 200** — sem rotação, o refresh não muda de estado (ADR-11) | decisão 13 + e2e |
| 14 | Refresh de médico que não existe mais | 401 `UNAUTHENTICATED` | decisão 15 |
| 15 | Payload inválido em **rota protegida** | **401, não 400** — o guard roda antes do pipe | §contexto + e2e |
| 16 | `GET /auth/me` de token válido | 200 `{ id, name, email }` — **nunca** `passwordHash` | INV-07 + e2e |
| 17 | `/api/docs` depois do guard global | Continua abrindo — não é rota do Nest. **Confirmar no passo 20**, não supor | decisão 4 + checklist |
| 18 | `POST /auth/logout` **sem** o campo `refreshToken` | **400 `VALIDATION_ERROR`** — a única resposta de logout que não é 204. "204 sempre" vale para o token, não para o corpo malformado (`PLAN.md §9.1` já prevê o 400) | decisão 16 + e2e |
| 19 | Usar o access **depois** do logout, dentro dos 15 min | **200** — o logout impede a renovação, não mata o access corrente. Testado como comportamento esperado, não como defeito | decisão 18 + e2e |
| 20 | Refresh cru chegando à porta em vez do hash | Não deve existir caminho: o parâmetro se chama `hash` e o service hasheia antes | decisão 17 + INV-06 |

> INV-01, INV-02, INV-03 e INV-05 não entram: não há agenda nem paciente. **INV-04
> entra pela primeira vez**, mas ainda sem recurso próprio para escopar — o que esta
> sprint entrega é a *fonte* do escopo (`@CurrentDoctor()`), e o primeiro uso real é
> 03.01.
<!-- /§edge-cases -->

---

<!-- §checklist -->
## Checklist anti-erro (pré-fechamento)

**Verde**
- [x] `lint` + `typecheck` + `build` + `test` + `test:e2e` — todos verdes
- [x] Fluxo completo exercitado à mão contra a API no ar: login → me → refresh → me com o novo access → logout (204) → refresh 401. Feito por `curl` no container; `/api/docs` conferido abrindo e documentando as 5 rotas

**Segurança** (veto `[Seguranca]`)
- [x] **Varredura de rotas** via `DiscoveryService` (decisão 20): o conjunto de handlers com `IS_PUBLIC_KEY` é **exatamente** `health`, `login`, `refresh`, `logout`
- [x] **INV-06:** nenhum caminho passa o refresh cru para a porta — o service hasheia, e o parâmetro se chama `hash` (decisão 17)
- [x] `@Public()` está em exatamente 4 rotas: `health`, `login`, `refresh`, `logout` — nenhuma a mais
- [x] JWT com segredo errado, expirado ou adulterado → 401 (não 500, não 200)
- [x] **INV-04:** nenhum controller aceita `doctorId` do payload ou da query; a única fonte é `@CurrentDoctor()`
- [x] **INV-07:** `me` devolve `{ id, name, email }` e nada mais — e o corte acontece **no service** (`DoctorProfile`), não só no presenter (decisão 22)
- [x] Nenhum log com token, hash de token ou email — só ID
- [x] O guard não consulta o banco (decisão 5), e isso está declarado em comentário no arquivo
- [x] Nenhuma resposta distingue "refresh inexistente" de "refresh revogado"

**Domínio e arquitetura**
- [x] Os 3 services não importam `typeorm`, `@nestjs/jwt` nem `node:crypto` — lint verde
- [x] Nenhum service recebe `Request`; `doctorId` chega por parâmetro
- [x] Cada service tem **um** `execute`, e devolve `Either` — exceto `RevokeSessionService`, que devolve `void` porque não tem erro esperado (decisão 19)
- [x] `AuthenticationModule` exporta os services, nunca os tokens de repositório
- [x] `HttpModule` importa `CryptographyModule` (o guard precisa da porta), não o `JwtModule`
- [x] Nenhuma transação: `revokeByHash` é um `UPDATE` de uma linha

**Contrato** (`[Produto]`)
- [x] `POST /api/auth/refresh` → 200 `{ accessToken, expiresIn }` · 401 `INVALID_REFRESH_TOKEN`
- [x] `POST /api/auth/logout` → **204 sempre**, sem corpo
- [x] `GET /api/auth/me` → 200 `{ id, name, email }` · 401 `UNAUTHENTICATED`
- [x] As 3 rotas aparecem em `/api/docs`, com `@ApiBearerAuth()` só em `me`
- [x] Cada rota tem `@ApiResponse` com exemplo de sucesso **e** do erro interessante (401), como o login de 02.01
- [x] O Swagger de `logout` diz, em uma linha, que o access corrente sobrevive até expirar (decisão 18) — o avaliador vai testar exatamente isso
- [x] `/api/docs` continua abrindo com o guard global no ar (edge case 17)
- [x] Mensagens em PT-BR, `code` do catálogo de `PLAN.md §9.4`

**Testes** (`[QA]`, fecha F2)
- [x] Os 5 casos de sessão de `PLAN.md §12.4` têm teste nomeado
- [x] Refresh expirado testado por linha com data passada, não por fake timer (decisão 10)
- [x] Nenhum registro compartilhado entre casos — `TRUNCATE` + `insert` no `beforeEach`
- [x] Teste de refresh concorrente: **dois 200 com access tokens diferentes** — sem rotação não há corrida a resolver, e afirmar "um ganha" seria testar o oposto do contrato (ADR-11)
- [x] Existe teste para o que o logout **não** faz (edge case 19) — comportamento declarado precisa de prova, senão vira surpresa em avaliação
- [ ] **Edge case 15 (payload inválido em rota protegida → 401) sem teste** — não é lacuna de cobertura: não existe rota protegida com corpo até `POST /api/patients` (03.01), e o caso entra no e2e de lá. Ver issue 3

**Plano**
- [x] `PLAN.md §8.4` atualizado com `verifyAccessToken` (decisão 1)
- [x] `PLAN.md §8.5` registra que `logout` é `@Public()` e por quê (decisão 4)
- [x] `PRODUCT.md §roadmap`: linha 02.02 → ✅
- [x] Débito novo, se houver, no ledger com gatilho de reabertura — **nenhum nasceu**; DEBT-11 ganhou o limite conhecido da mitigação (o access sobrevive ao logout por ≤ 15 min)
<!-- /§checklist -->

---

<!-- §scores -->
## Scores de fricção

### Fricção PRÉ — 2026-08-08

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Seguranca]` | PRÉ | **7/10 → 9/10** | ALTO (2) | REJECTED na 1ª passada. **(a)** O doc mandava `findValidByHash(hash)` sem dizer **quem** hasheia: o caminho em que o valor cru chega à porta é uma linha de distância, produz 401 permanente, e o conserto intuitivo de quem não conhece INV-06 é gravar o cru. Resolvido pela decisão 17, que fixa o service como o ponto e o nome do parâmetro como barreira. **(b)** A sprint vendia "logout encerra a sessão" sem declarar que o access sobrevive até 15 min — a decisão 5 (guard sem banco) cria essa janela e nenhuma linha a assumia. Resolvido pelas decisões 18 e 21, pelo edge case 19 e por uma nota em DEBT-11. O resto passou: `@Public()` enumerado e justificado, INV-04 com fonte única, INV-07 por presenter, nada de PII em log |
| `[Dominio]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: o checklist exigia `Either` de **todo** service, mas `RevokeSessionService` não tem erro esperado — o `Left` seria `never`, e a regra teria ensinado ruído de tipo para as fases seguintes. Resolvido pela decisão 19. BAIXO (resolvido): ler dois agregados no mesmo caso de uso parecia furar ADR-04; a nota em §nomes registra que a fronteira é o **módulo**, e que o proibido é escrever em dois, não ler. Convergiu com o `[Seguranca]` no achado de INV-06, por caminho independente |
| `[Backend]` | PRÉ | **8/10 → 9/10** | MÉDIO (1) | MÉDIO: a varredura de rotas do §objetivo não tinha mecanismo. Feita pelo `_router` do Express, o teste passa a depender da versão do transporte e quebra sem defeito no produto — e o `[QA]` proíbe teste acoplado a implementação. Resolvido pela decisão 20 (`DiscoveryService`, metadado, API pública). BAIXO (resolvido): a forma de `request.doctor` era contrato implícito entre guard e decorator — virou o tipo `AuthenticatedDoctor`, num arquivo só. O resto passou: camadas, DI por porta, guard em `framework/`, `HttpModule` importando o módulo e não o `JwtModule` |
| `[Produto]` | PRÉ | **8/10 → 9/10** | MÉDIO (2) | **(a)** "204 sempre" no logout contradizia o 400 que `PLAN.md §9.1` prevê para corpo malformado — divergência entre doc e contrato é o achado que transforma documentação em mentira. Virou o edge case 18. **(b)** O texto das duas respostas 401 não estava fixado: `UnauthenticatedError` lançado pelo guard com mensagem livre produziria dois textos para o mesmo status. Fixado pela decisão 21, alinhado a `PRODUCT.md §regras`. BAIXO (resolvido): checklist não exigia `@ApiResponse` com exemplo de erro, que é o que faz a rota ser exercitável no `/api/docs` |
| `[QA]` | PRÉ | **9/10** | BAIXO (1) | Os 5 casos de sessão de `PLAN.md §12.4` estão rastreados; refresh expirado testado por linha com data passada em vez de fake timer (decisão 10) — que é o único jeito honesto, já que o relógio da comparação é o do Postgres (decisão 9). BAIXO: o checklist herdara de 02.01 a asserção "sobre o conjunto" para o teste concorrente, que só faz sentido onde há corrida; sem rotação o correto é afirmar dois 200 com tokens distintos. Corrigido |

**Conflitos entre agentes:** nenhum. O achado de INV-06 apareceu em `[Seguranca]` e
`[Dominio]` de forma independente — convergência, não conflito.

**Verificado antes de decidir, não inferido:**

```
grep/read no repositório  → UnauthenticatedError e InvalidRefreshTokenError já
                            existem em shared/errors/types, sem ninguém que os lance
exception-filter.ts       → STATUS_BY_DOMAIN_CODE já mapeia os dois para 401
swagger.setup.ts          → SwaggerModule.setup('api/docs') é middleware, não rota
                            do Nest — daí a hipótese da decisão 4, que ainda assim
                            vai ao passo 20 como **confirmação**, não como fato
model-entities/…          → refresh_tokens.revoked_at é o único campo nulo da tabela
```

### Passe de precisão — 2026-08-08, depois da fricção PRÉ

O §contexto foi reescrito para ser executável: assinaturas completas, os dois
`QueryBuilder` inteiros, o guard e os decorators, o esqueleto da varredura. Não é
enfeite — **fixar a assinatura achou mais um defeito**, que a prosa escondia:

| Achado | Agente | Severidade | Resolução |
| --- | --- | --- | --- |
| `GetProfileService` devolveria a entity `Doctor`, que carrega `passwordHash`. INV-07 é cobrada no **retorno do caso de uso**, não só na resposta HTTP — com a entity subindo, o presenter vira a única defesa, e presenter é onde se esquece de tirar campo | `[Dominio]` / `[Seguranca]` | MÉDIO | Decisão 22: o service devolve `DoctorProfile` |

Duas APIs que a prosa dava como certas foram conferidas no container antes de virar
código (bloco "API de terceiro" no §contexto): `Reflector.getAllAndOverride` aceita
`metadataKey` como string, e `DiscoveryService` exige `DiscoveryModule` importado —
sem isso o teste do passo 21b não compilaria e a descoberta viria no meio da
implementação.

**Pendências levadas para a implementação** (não bloqueiam):
1. Confirmar no passo 20 que `/api/docs` abre com o guard global no ar.
2. Atualizar `review-security.md §verifica` item 5 — a lista de rotas públicas de lá não inclui `logout`. Feito no fechamento desta sprint, junto de `PLAN.md §8.4` e `§8.5`.

### Fricção PÓS — 2026-08-08

| Agente | Fase | Score | Severidade máxima | Observação |
| --- | --- | --- | --- | --- |
| `[Seguranca]` | PÓS | **9/10** | BAIXO (1) | As quatro rotas públicas travadas por asserção de **igualdade** (`public-routes.e2e-spec.ts`), não por `toContain`: pública a mais reprova, pública a menos também. INV-06 provado nos dois casos de uso pelo hash que a porta recebeu, e o e2e afirma que o valor cru não aparece na consulta. INV-07 com corte em duas camadas (decisão 22). Recusa idêntica para refresh desconhecido, revogado e expirado — asserção sobre o envelope inteiro, não sobre o status. `me` sem token, com esquema errado, com token expirado e com token de outro segredo: 401 nos quatro. BAIXO: o 400 do logout não estava no Swagger — corrigido antes do fechamento |
| `[Dominio]` | PÓS | **9/10** | — | Um `execute` por service; `Either` nos dois que têm erro esperado e `void` no que não tem (decisão 19); nenhuma transação; nenhum service toca `Request`. O tipo do erro é o semanticamente correto nos dois caminhos — `InvalidRefreshTokenError` para o token, `UnauthenticatedError` para o dono da sessão que sumiu, e o teste afirma a distinção |
| `[Backend]` | PÓS | **9/10** | MÉDIO (1) | Camadas limpas com lint verde: os services não importam ORM, cripto nem transporte; o guard vive em `framework/` e injeta a **porta**, não o `JwtModule`; `HttpModule` importa módulos, não tokens. O `-1` é o issue 2: a fronteira do guard alcançou fixture de teste, e isso a fricção PRÉ não previu — o achado apareceu como três testes vermelhos em vez de como decisão |
| `[Produto]` | PÓS | **9/10** | BAIXO (1) | Contrato conferido **contra o documento OpenAPI gerado**, não contra o código: 5 rotas, `me` com `security: bearer`, `refresh` com 200/401, `logout` com 204 e agora 400. Textos em PT-BR, `code` do catálogo, e a descrição do logout diz em uma linha que o access corrente sobrevive — que é a pergunta que o avaliador vai fazer clicando |
| `[QA]` | PÓS | **9/10** | MÉDIO (1) | 50 unitários + 44 e2e verdes. Os 5 casos de sessão de `PLAN.md §12.4` com teste nomeado; refresh expirado por linha com data passada; concorrência afirmando dois 200 e uma linha viva; logout idempotente afirmando que `revoked_at` **não** se reescreve. MÉDIO: o edge case 15 ficou sem teste — e a causa é honesta (issue 3): não há rota protegida com corpo até 03.01 |

**Conflitos entre agentes:** nenhum.

**Gates no fechamento** (em `docker exec api-prontomed`, onde as dependências vivem):

```
typecheck  ✅   lint  ✅   build  ✅
test       ✅   8 suítes, 50 casos
test:e2e   ✅   6 suítes, 44 casos
/api/docs  ✅   200 com o guard global no ar — hipótese da decisão 4 confirmada
docs-json  ✅   5 rotas; só `GET /api/auth/me` com `security: bearer`
fluxo real ✅   login → me → refresh → me com o access novo → logout (204) →
                refresh com o mesmo token → 401 INVALID_REFRESH_TOKEN
```
<!-- /§scores -->

---

<!-- §issues -->
## Issues encontrados durante a implementação

| # | Descoberta | Causa raiz | Solução | Arquivos | Virou |
| --- | --- | --- | --- | --- | --- |
| **1** | O `typecheck` quebrou nos **duplos de teste de 02.01** assim que as portas ganharam método: `InMemoryDoctorRepository`, `InMemoryRefreshTokenRepository` e `FakeTokenIssuer` deixaram de satisfazer as interfaces | Efeito esperado de alargar porta — e útil: é o compilador cobrando LSP. O que **não** era esperado é que a fricção PRÉ não tivesse previsto o passo | Duplos implementam a porta **inteira**, com semântica fiel (o in-memory ignora revogado e expirado como o adapter real), não com `throw new Error('não usado')` | `authenticate-doctor.service.spec.ts` | Regra: duplo que atende metade da porta passa a mentir no dia em que o service crescer. Alargar porta é sempre um passo a mais no §escopo |
| **2** | O guard global reprovou **três testes de infraestrutura** (`error-envelope.e2e-spec.ts`): a sonda `ProbeController` passou a responder 401 | O guard alcança **qualquer** controller registrado no `TestingModule`, inclusive fixture de teste. A fricção PRÉ pensou em rotas de produção e não em `test/factories/` | `@Public()` na sonda, com o motivo no comentário: ela existe para exercitar pipe e filtro, e sem isso aqueles testes passariam a provar o guard | `test/factories/probe.controller.ts` | Nota: a varredura de `public-routes.e2e-spec.ts` **não** conta a sonda — ela não é registrada pelo `AppModule`. As duas coisas coexistem sem furo |
| **3** | O **edge case 15** (payload inválido em rota protegida → 401, não 400) não tem teste | Não é falha de cobertura: **não existe rota protegida com corpo** nesta sprint. `me` é `GET`; as três com corpo são públicas. A ordem `guard → pipe` é fato do Nest, mas aqui não é observável | Declarado, não fingido. Primeira rota protegida com corpo é `POST /api/patients` (03.01), e o caso entra no e2e de lá | — | O edge case fica no doc com o destino anotado. Marcar o checklist sem teste seria a única saída pior |
| **4** | O texto `'Autenticação necessária.'` existe em **três** lugares: `exception-filter.ts`, `framework/authentication/` e dois services | ADR-06/DEBT-03 recusam catálogo de mensagens, e o domínio não pode importar `framework/`. Sem catálogo, o literal se repete por construção | Mantido. O `UNAUTHENTICATED_MESSAGE` cobre guard e decorator; os dois services trazem o literal com comentário apontando para a decisão 21 | `refresh-session.service.ts`, `get-profile.service.ts` | **Preço declarado** da ADR-06 nesta sprint. Gatilho para reabrir: um quarto lugar precisar do mesmo texto |

> Preencher **durante** a sprint, não no fechamento.
<!-- /§issues -->
