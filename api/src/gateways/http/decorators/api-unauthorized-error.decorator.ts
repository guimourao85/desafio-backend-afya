import { applyDecorators } from '@nestjs/common';
import { ApiUnauthorizedResponse } from '@nestjs/swagger';

const DESCRIPTION =
  'Sem token, com token expirado, malformado ou assinado com outro segredo. No Swagger: clique em **Authorize** e cole o `accessToken` do login.';

/**
 * O 401 de sessão, documentado num lugar só (sprint 05.01, decisão 2).
 *
 * Quem devolve este erro não é a rota: é o `JwtAuthGuard` global, que lança
 * `UnauthenticatedError` (`jwt-auth.guard.ts:176-180`) — o mesmo `code` e o mesmo
 * texto para header ausente, esquema errado e token recusado, de propósito. Toda
 * rota com `@ApiBearerAuth()` responde exatamente isto, e é o erro mais provável de
 * quem avalia a API pelo Swagger: executar antes de clicar em **Authorize**.
 *
 * **Não serve para o 401 de `login` nem para o de `refresh`** (decisão 3). Aqueles
 * dois são outro erro com o mesmo status — `INVALID_CREDENTIALS` e
 * `INVALID_REFRESH_TOKEN` —, e mantêm bloco próprio: unificar apagaria a diferença
 * entre "você não se identificou" e "sua credencial está errada".
 */
export function ApiUnauthorizedErrorResponse(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiUnauthorizedResponse({
      description: DESCRIPTION,
      schema: {
        example: {
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: 'Autenticação necessária.',
        },
      },
    }),
  );
}
