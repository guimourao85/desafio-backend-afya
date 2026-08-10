import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RevokeSessionService } from '@/domains/domain/services/authentication/revoke-session.service';
import { Public } from '@/framework/authentication/public.decorator';

import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { RefreshTokenDto } from '../../../schemas/domain/authentication.schema';

/**
 * `POST /api/auth/logout` — encerra a sessão.
 *
 * Logout nunca falha: token desconhecido, expirado ou já revogado respondem 204
 * igual. Não há o que informar — em todos os casos o cliente joga o token fora.
 *
 * **O que este logout não faz:** derrubar o access token que já está na mão de
 * alguém. O access se valida sozinho, sem consultar o banco, então quem tem um
 * continua entrando por até 15 minutos. O que o logout garante é que a sessão
 * **não se renova** — depois disso ela morre sozinha. Encurtar essa janela
 * exigiria consultar uma lista de bloqueio em toda requisição, que é exatamente o
 * custo que este desenho existe para evitar.
 *
 * Mais detalhes: PRODUCT.md — §regras · DEBITOS-TECNICOS.md — DEBT-11.
 */
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
  @ApiBody({
    type: RefreshTokenDto,
    examples: {
      doLogin: {
        summary: 'Cole o refreshToken devolvido por POST /api/auth/login',
        value: { refreshToken: 'cole-aqui-o-refreshToken-do-login' },
      },
    },
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada — ou já estava.' })
  // O 204 vale para o **token**; corpo malformado continua sendo 400. O bloco
  // inline que vivia aqui desde a 02.01 virou o decorator da sprint 05.01: o
  // envelope é o mesmo das outras catorze rotas, e a `description` guarda o que era
  // próprio desta — a única resposta de logout que surpreende quem leu só o resumo.
  @ApiValidationErrorResponse({
    description: 'Corpo sem o campo `refreshToken`. O 204 tolerante vale para o **token**, não para o payload.',
    details: [{ path: 'refreshToken', message: 'O token de sessão é obrigatório.' }],
  })
  async handle(@Body() body: RefreshTokenDto): Promise<void> {
    // Sem `if`: o caso de uso não devolve erro esperado, e o 204 é a resposta
    // inteira. O `await` existe para que uma falha de infraestrutura vire 500 em
    // vez de um 204 mentiroso enquanto a promessa ainda corre.
    await this.revokeSession.execute(body);
  }
}
