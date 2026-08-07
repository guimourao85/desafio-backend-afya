import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const probeSchema = z
  .object({
    email: z.string().email(),
    age: z.number().int().positive(),
  })
  .strict();

export class ProbeDto extends createZodDto(probeSchema) {}

/**
 * Sonda de teste: até F2 nenhuma rota de produção recebe corpo, e duas peças do
 * kernel só podem ser exercitadas com uma que receba — o `APP_PIPE` global (400
 * com `details[]`) e a derivação do schema Zod para o OpenAPI.
 *
 * Vive em `test/`, fora do alcance do `nest build`: não chega a produção.
 */
@ApiTags('probe')
@Controller('probe')
export class ProbeController {
  @Post()
  @ApiOperation({ summary: 'Sonda de teste — não faz parte da API' })
  handle(@Body() body: ProbeDto): ProbeDto {
    return body;
  }
}
