import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UnauthenticatedError } from '@/shared/errors/types';
import { TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { AuthenticatedRequest, UNAUTHENTICATED_MESSAGE } from './authenticated-doctor';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * O guard global (`APP_GUARD`): **toda rota nasce autenticada**, e só sai desse
 * estado com `@Public()` explícito.
 *
 * O default importa mais que a implementação. Um guard aplicado rota a rota erra
 * para o lado aberto — esquecer o decorator não quebra teste nenhum, e a API fica
 * exposta com a suíte verde. Aqui o esquecimento produz 401 numa rota que devia
 * ser pública: barulhento, pego no primeiro clique.
 *
 * **Não consulta o banco.** O access token é auto-validável — é a razão de ele ser
 * JWT. Conferir o `sub` na tabela a cada requisição transformaria os 15 minutos de
 * TTL numa ida ao banco em toda rota da API. O preço está declarado: médico apagado
 * (ou sessão encerrada) continua entrando até o token expirar. O que corta de
 * verdade é a revogação do refresh, que é opaco justamente para isso.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenIssuer: TokenIssuer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler antes da classe: um método `@Public()` abre mesmo dentro de um
    // controller fechado, e não o contrário.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = await this.tokenIssuer.verifyAccessToken(this.extractBearer(request));

    if (!payload) {
      // `UnauthenticatedError`, e não `UnauthorizedException`: o `code` sai do
      // catálogo de erros do projeto, não do fallback por status do filtro.
      throw new UnauthenticatedError(UNAUTHENTICATED_MESSAGE);
    }

    request.doctor = { id: payload.sub, email: payload.email };

    return true;
  }

  /**
   * Parse estrito. Header ausente, sem `Bearer `, com prefixo trocado ou com o
   * token vazio vira string vazia — que a porta rejeita como qualquer outro token
   * inválido. Nenhum caminho aqui decide sozinho que a requisição está autenticada.
   */
  private extractBearer(request: AuthenticatedRequest): string {
    const header = request.headers.authorization;

    if (typeof header !== 'string') return '';

    const [scheme, token] = header.split(' ');

    return scheme === 'Bearer' && token ? token : '';
  }
}
