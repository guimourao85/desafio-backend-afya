import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@/framework/authentication/public.decorator';

/**
 * `GET /api/health` — a API está no ar?
 *
 * Responde `{ status: 'ok' }` e nada mais. **Não** consulta o banco, de propósito:
 * sondar exigiria dar uma conexão de banco a este controller, criando uma
 * dependência que ele não deveria ter. Banco caído já é denunciado pela migration
 * e por qualquer rota autenticada.
 *
 * Mais detalhes: PLAN.md §13 (F0) · Apêndice C.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  // Pública: liveness que exige credencial não responde a pergunta "o container
  // está de pé?" — responde "o container está de pé e eu tenho um token".
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica se a API está no ar' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  handle(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
