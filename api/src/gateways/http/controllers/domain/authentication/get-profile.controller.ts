import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetProfileService } from '@/domains/domain/services/authentication/get-profile.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import { DoctorHttpResponse, DoctorPresenter } from '@/presentation/presenters/doctor.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';

/**
 * `GET /api/auth/me` — quem sou eu.
 *
 * A rota que o front chama depois do login para saber o nome de quem entrou. Não
 * recebe parâmetro nenhum: a identidade sai do token. É por isso que não existe um
 * `GET /api/auth/:id` — se existisse, um médico leria o perfil de outro.
 *
 * Vai ao banco em vez de servir o que já está dentro do token, porque o nome não
 * está lá — e colocá-lo criaria uma cópia que envelhece: o médico trocaria o nome
 * e o token continuaria dizendo o antigo por 15 minutos.
 *
 * Mais detalhes: PRODUCT.md — INV-04, INV-07.
 */
@ApiTags('autenticação')
@Controller('auth')
export class GetProfileController {
  constructor(private readonly getProfile: GetProfileService) {}

  // Sem `@Public()`: é a primeira rota autenticada da API. O guard global já a
  // fecha — o que existe aqui é a **ausência** de decorator, e é assim que deve ser.
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devolve o perfil do médico autenticado' })
  @ApiOkResponse({
    schema: {
      example: {
        id: '3f1c8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        name: 'Dra. Ana Souza',
        email: 'ana.souza@prontomed.dev',
      },
    },
  })
  // Este bloco era inline — foi a primeira rota autenticada da API e documentou o
  // 401 sozinha. Virou decorator na sprint 05.01: o mesmo erro aparecia em treze
  // rotas e estava escrito em uma.
  @ApiUnauthorizedErrorResponse()
  async handle(@CurrentDoctor() doctorId: string): Promise<DoctorHttpResponse> {
    // `doctorId` vem do token, nunca da rota ou do corpo — é o que INV-04 exige, e
    // o motivo de não existir `GET /auth/:id`.
    const result = await this.getProfile.execute({ doctorId });

    if (result.isLeft()) {
      throw result.value;
    }

    return DoctorPresenter.toHttp(result.value);
  }
}
