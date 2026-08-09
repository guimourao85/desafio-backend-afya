import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { GetProfileService } from '@/domains/domain/services/authentication/get-profile.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import { DoctorHttpResponse, DoctorPresenter } from '@/presentation/presenters/doctor.presenter';

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
  @ApiUnauthorizedResponse({
    description: 'Sem token, token expirado, malformado ou assinado com outro segredo.',
    schema: {
      example: {
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Autenticação necessária.',
      },
    },
  })
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
