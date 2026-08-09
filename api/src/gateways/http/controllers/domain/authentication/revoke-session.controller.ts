import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RevokeSessionService } from '@/domains/domain/services/authentication/revoke-session.service';
import { Public } from '@/framework/authentication/public.decorator';

import { RefreshTokenDto } from '../../../schemas/domain/authentication.schema';

@ApiTags('autenticação')
@Controller('auth')
export class RevokeSessionController {
  constructor(private readonly revokeSession: RevokeSessionService) {}

  // Pública: sair precisa funcionar justamente quando o access já expirou. Quem
  // apresenta o refresh já o possui — revogá-lo não dá poder novo a ninguém.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Encerra a sessão, revogando o refresh token',
    description:
      'Responde 204 mesmo com token desconhecido, expirado ou já revogado. O access token corrente **continua válido até expirar** (até 15 minutos): o logout impede a renovação, não a requisição em curso.',
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada — ou já estava.' })
  // O 204 vale para o **token**; corpo malformado continua sendo 400. Documentado
  // porque é a única resposta de logout que surpreende quem leu só o resumo.
  @ApiBadRequestResponse({
    description: 'Corpo sem o campo `refreshToken`.',
    schema: {
      example: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida.',
        details: [{ path: 'refreshToken', message: 'O token de sessão é obrigatório.' }],
      },
    },
  })
  async handle(@Body() body: RefreshTokenDto): Promise<void> {
    // Sem `if`: o caso de uso não devolve erro esperado, e o 204 é a resposta
    // inteira. O `await` existe para que uma falha de infraestrutura vire 500 em
    // vez de um 204 mentiroso enquanto a promessa ainda corre.
    await this.revokeSession.execute(body);
  }
}
