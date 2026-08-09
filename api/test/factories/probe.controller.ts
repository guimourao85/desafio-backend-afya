import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { Public } from '@/framework/authentication/public.decorator';

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
  // `@Public()` desde 02.02: o guard global fecha toda rota, e esta sonda existe
  // para exercitar **pipe e filtro**. Sem isto, os testes de envelope passariam a
  // provar o guard e parariam de provar o que foram escritos para provar.
  // Não conta na varredura de `public-routes.e2e-spec.ts`: a sonda vive em `test/`
  // e não é registrada pelo `AppModule`.
  @Public()
  @Post()
  @ApiOperation({ summary: 'Sonda de teste — não faz parte da API' })
  handle(@Body() body: ProbeDto): ProbeDto {
    return body;
  }
}
