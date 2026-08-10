import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { RefreshSessionService } from '@/domains/domain/services/authentication/refresh-session.service';
import { Public } from '@/framework/authentication/public.decorator';
import {
  AccessTokenHttpResponse,
  AccessTokenPresenter,
} from '@/presentation/presenters/access-token.presenter';

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
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 900,
      },
    },
  })
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
