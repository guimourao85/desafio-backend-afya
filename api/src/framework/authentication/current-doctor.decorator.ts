import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { UnauthenticatedError } from '@/shared/errors/types';

import { AuthenticatedRequest, UNAUTHENTICATED_MESSAGE } from './authenticated-doctor';

/**
 * A **única** fonte de `doctorId` no sistema (INV-04).
 *
 * Devolve o `id`, não o objeto inteiro: o controller não tem o que fazer com o
 * email do token, e entregá-lo convidaria alguém a tratar campo de token como
 * dado do banco. Nenhum service lê `request` — o controller recebe a string aqui e
 * a passa por parâmetro.
 *
 * O dia em que um `doctorId` chegar por body ou query, o escopo por médico deixa
 * de valer: é escalada de privilégio de uma linha.
 */
export const CurrentDoctor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Só acontece se o decorator for usado numa rota `@Public()`, onde o guard não
    // populou nada. Falha alto e no primeiro clique, em vez de devolver `undefined`
    // e escopar a consulta inteira por nada.
    if (!request.doctor) {
      throw new UnauthenticatedError(UNAUTHENTICATED_MESSAGE);
    }

    return request.doctor.id;
  },
);
