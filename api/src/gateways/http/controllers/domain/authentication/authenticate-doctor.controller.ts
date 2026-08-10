import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthenticateDoctorService } from '@/domains/domain/services/authentication/authenticate-doctor.service';
import { Public } from '@/framework/authentication/public.decorator';
import { SessionHttpResponse, SessionPresenter } from '@/presentation/presenters/session.presenter';

import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { AuthenticateDoctorDto } from '../../../schemas/domain/authentication.schema';

/**
 * `POST /api/auth/login` — onde a sessão nasce.
 *
 * Devolve três coisas: o `accessToken` (curto, 15 minutos, é o que vai no header
 * de toda outra rota), o `refreshToken` (longo, 8 horas, serve só para pedir um
 * access novo) e `expiresIn` em segundos.
 *
 * Email inexistente e senha errada respondem **exatamente igual** — mesmo status,
 * mesmo código, mesmo texto. Distinguir os dois transformaria o login num
 * consultor de "esta pessoa tem conta aqui", e num prontuário isso já é vazamento
 * de dado sensível antes de qualquer senha ser quebrada.
 *
 * Mais detalhes: PRODUCT.md — §regras.
 */
@ApiTags('autenticação')
@Controller('auth')
export class AuthenticateDoctorController {
  constructor(private readonly authenticateDoctor: AuthenticateDoctorService) {}

  // Pública pelo óbvio: é onde a sessão nasce. Sem isto, ninguém entra nunca.
  @Public()
  @Post('login')
  // O `@Post()` do Nest responde 201 por padrão. Login não cria recurso: abre sessão.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica o médico e abre uma sessão' })
  // A credencial do seed vem preenchida: é o **primeiro** Execute da avaliação, e
  // sem exemplo o Swagger UI monta `password: "string"` e devolve 401. A senha é a
  // mesma do `.env.example`, placeholder de ambiente dev-only — o seed recusa rodar
  // fora de `APP_ENV=dev`, e a API não tem build de produção (ADR-12).
  @ApiBody({
    type: AuthenticateDoctorDto,
    examples: {
      seed: {
        summary: 'Credencial do médico de demonstração (npm run seed)',
        value: { email: 'medico@prontomed.dev', password: 'prontomed123' },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'Zm9vYmFyLXRva2VuLW9wYWNvLWRlLTMyLWJ5dGVz',
        expiresIn: 900,
      },
    },
  })
  @ApiValidationErrorResponse({ details: [{ path: 'email', message: 'Informe um email válido.' }] })
  // 401 próprio, e não o decorator de sessão (sprint 05.01, decisão 3): aqui o
  // `code` é `INVALID_CREDENTIALS` — "sua credencial está errada", não "você não
  // se identificou". Mesmo status, outro erro.
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
