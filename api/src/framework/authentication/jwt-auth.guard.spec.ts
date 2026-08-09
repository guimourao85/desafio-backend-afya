import { Controller, ExecutionContext, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UnauthenticatedError } from '@/shared/errors/types';
import { AccessTokenPayload, TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { AuthenticatedRequest } from './authenticated-doctor';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

const VALID_TOKEN = 'token-assinado-por-nos';
const PAYLOAD: AccessTokenPayload = {
  sub: '11111111-1111-1111-1111-111111111111',
  email: 'helena@prontomed.dev',
};

/**
 * Controller de mentira, com decorator **de verdade**. O `Reflector` também é o
 * real: um duplo de `Reflector` provaria que o guard chama um objeto que alguém
 * escreveu no teste, não que `@Public()` abre a rota.
 */
@Controller('fake')
class FakeController {
  @Public()
  @Get('aberta')
  aberta(): void {}

  @Get('fechada')
  fechada(): void {}
}

class FakeTokenIssuer implements TokenIssuer {
  verifyCalls = 0;

  async issueAccessToken(): Promise<never> {
    throw new Error('não usado');
  }

  generateRefreshToken(): string {
    throw new Error('não usado');
  }

  hashRefreshToken(): string {
    throw new Error('não usado');
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    this.verifyCalls += 1;

    return token === VALID_TOKEN ? PAYLOAD : null;
  }
}

function makeContext(
  handler: (...args: unknown[]) => unknown,
  request: AuthenticatedRequest,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeRequest(authorization?: string): AuthenticatedRequest {
  return { headers: authorization === undefined ? {} : { authorization } };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let tokenIssuer: FakeTokenIssuer;

  beforeEach(() => {
    tokenIssuer = new FakeTokenIssuer();
    guard = new JwtAuthGuard(new Reflector(), tokenIssuer);
  });

  it('libera rota marcada com @Public() sem sequer olhar o token', async () => {
    const context = makeContext(FakeController.prototype.aberta, makeRequest());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenIssuer.verifyCalls).toBe(0);
  });

  it('autentica e publica o médico no request', async () => {
    const request = makeRequest(`Bearer ${VALID_TOKEN}`);

    await expect(guard.canActivate(makeContext(FakeController.prototype.fechada, request))).resolves.toBe(
      true,
    );
    expect(request.doctor).toEqual({ id: PAYLOAD.sub, email: PAYLOAD.email });
  });

  it.each([
    ['sem header Authorization', undefined],
    ['header vazio', ''],
    ['sem o esquema Bearer', VALID_TOKEN],
    ['com esquema errado', `Basic ${VALID_TOKEN}`],
    ['com Bearer sem token', 'Bearer'],
    ['com token que a porta recusa', 'Bearer token-de-outro-segredo'],
  ])('recusa requisição %s', async (_caso, authorization) => {
    const request = makeRequest(authorization);
    const context = makeContext(FakeController.prototype.fechada, request);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthenticatedError);
    // Nada foi publicado no request: rota fechada não deixa rastro de identidade.
    expect(request.doctor).toBeUndefined();
  });

  it('recusa com o mesmo texto em todos os casos — não diz qual parte falhou', async () => {
    const recusa = async (authorization?: string): Promise<unknown> =>
      guard
        .canActivate(makeContext(FakeController.prototype.fechada, makeRequest(authorization)))
        .then(
          () => null,
          (error: unknown) => error,
        );

    const semHeader = await recusa();
    const tokenRuim = await recusa('Bearer outro');

    // O `instanceof` antes das comparações: sem ele, dois `undefined` iguais
    // passariam por "mensagens idênticas".
    expect(semHeader).toBeInstanceOf(UnauthenticatedError);
    expect(tokenRuim).toBeInstanceOf(UnauthenticatedError);
    expect((semHeader as UnauthenticatedError).message).toBe(
      (tokenRuim as UnauthenticatedError).message,
    );
    expect((semHeader as UnauthenticatedError).code).toBe('UNAUTHENTICATED');
  });
});
