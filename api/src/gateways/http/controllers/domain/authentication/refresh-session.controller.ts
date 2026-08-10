import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RefreshSessionService } from '@/domains/domain/services/authentication/refresh-session.service';
import { Public } from '@/framework/authentication/public.decorator';
import {
  AccessTokenHttpResponse,
  AccessTokenPresenter,
} from '@/presentation/presenters/access-token.presenter';

import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { RefreshTokenDto } from '../../../schemas/domain/authentication.schema';

/**
 * `POST /api/auth/refresh` — troca um refresh token válido por um access novo.
 *
 * Existe porque o access dura só 15 minutos. Em vez de pedir a senha de novo a
 * cada 15 minutos, o cliente guarda o refresh (8 horas) e pede um access novo
 * quando o antigo morre.
 *
 * O refresh **não** é trocado nessa operação: continua o mesmo até expirar ou até
 * o logout. A consequência prática é boa — duas abas renovando ao mesmo tempo
 * recebem dois access válidos e nenhuma perde a sessão.
 *
 * Refresh inexistente, expirado e revogado respondem os três a mesma coisa: dizer
 * qual dos três aconteceu confirmaria informação para quem só tem um palpite, e o
 * cliente faz a mesma coisa nos três casos — login de novo.
 *
 * Mais detalhes: PRODUCT.md — §regras.
 */
@ApiTags('autenticação')
@Controller('auth')
export class RefreshSessionController {
  constructor(private readonly refreshSession: RefreshSessionService) {}

  // Pública: renovar existe porque o access **já** expirou. Exigir access válido
  // para renovar access é exigir a coisa que acabou de morrer.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Troca um refresh token válido por um novo access token',
    description:
      'O refresh não é rotacionado: ele continua valendo até expirar ou até o logout. Duas chamadas concorrentes devolvem dois access tokens válidos.',
  })
  // O exemplo não é executável, e não tem como ser: o refresh é opaco e nasce no
  // login. O que ele entrega é a instrução de **onde** buscar o valor — melhor que o
  // `"string"` que o Swagger UI geraria sozinho.
  @ApiBody({
    type: RefreshTokenDto,
    examples: {
      doLogin: {
        summary: 'Cole o refreshToken devolvido por POST /api/auth/login',
        value: { refreshToken: 'cole-aqui-o-refreshToken-do-login' },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 900,
      },
    },
  })
  @ApiValidationErrorResponse({
    details: [{ path: 'refreshToken', message: 'O token de sessão é obrigatório.' }],
  })
  // 401 próprio pelo mesmo motivo do login (decisão 3): `INVALID_REFRESH_TOKEN` diz
  // "sua sessão acabou, faça login de novo" — o cliente age diferente do 401 de
  // token ausente, e o texto precisa distinguir os dois.
  @ApiUnauthorizedResponse({
    description: 'Refresh inexistente, expirado ou revogado — a resposta é a mesma nos três casos.',
    schema: {
      example: {
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Sessão expirada. Faça login novamente.',
      },
    },
  })
  async handle(@Body() body: RefreshTokenDto): Promise<AccessTokenHttpResponse> {
    const result = await this.refreshSession.execute(body);

    if (result.isLeft()) {
      throw result.value;
    }

    return AccessTokenPresenter.toHttp(result.value);
  }
}
