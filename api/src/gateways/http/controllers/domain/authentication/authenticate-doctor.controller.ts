import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AuthenticateDoctorService } from '@/domains/domain/services/authentication/authenticate-doctor.service';
import { SessionHttpResponse, SessionPresenter } from '@/presentation/presenters/session.presenter';

import { AuthenticateDoctorDto } from '../../../schemas/domain/authentication.schema';

@ApiTags('autenticação')
@Controller('auth')
export class AuthenticateDoctorController {
  constructor(private readonly authenticateDoctor: AuthenticateDoctorService) {}

  @Post('login')
  // O `@Post()` do Nest responde 201 por padrão. Login não cria recurso: abre sessão.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica o médico e abre uma sessão' })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'Zm9vYmFyLXRva2VuLW9wYWNvLWRlLTMyLWJ5dGVz',
        expiresIn: 900,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Credencial inválida — a resposta é a mesma para email inexistente e senha errada.',
    schema: {
      example: {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou senha incorretos.',
      },
    },
  })
  async handle(@Body() body: AuthenticateDoctorDto): Promise<SessionHttpResponse> {
    const result = await this.authenticateDoctor.execute(body);

    // O `throw` aqui não é erro de fluxo: é a entrega do `DomainError` ao
    // `AllExceptionsFilter`, que já sabe traduzir `code` em status e envelope. O
    // controller não escolhe status nem escreve mensagem.
    if (result.isLeft()) {
      throw result.value;
    }

    return SessionPresenter.toHttp(result.value);
  }
}
