import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@/framework/authentication/public.decorator';

/**
 * Não sonda o banco de propósito (PLAN.md §13 F0): sondar exigiria injetar o
 * `DataSource` num controller — a dependência que o Apêndice C proíbe. Banco caído
 * é denunciado por `migration:run` e por qualquer rota autenticada.
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
