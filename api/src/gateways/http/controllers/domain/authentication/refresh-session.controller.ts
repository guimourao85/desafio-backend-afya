import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { RefreshSessionService } from '@/domains/domain/services/authentication/refresh-session.service';
import { Public } from '@/framework/authentication/public.decorator';
import {
  AccessTokenHttpResponse,
  AccessTokenPresenter,
} from '@/presentation/presenters/access-token.presenter';

import { RefreshTokenDto } from '../../../schemas/domain/authentication.schema';

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
