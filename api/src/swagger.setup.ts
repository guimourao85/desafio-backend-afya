import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';

/**
 * Publica o OpenAPI em `/api/docs` (documento em `/api/docs-json`).
 *
 * Fica fora do `configureApp()` de propósito: montar o documento é ferramenta de
 * desenvolvimento, e nenhuma suíte e2e deveria pagar esse custo para responder a
 * uma requisição. Quem exercita esta função é o `openapi.e2e-spec.ts`.
 */
export function setupSwagger(app: INestApplication): void {
  // Ensina o @nestjs/swagger a ler schema de DTO criado por `createZodDto`. Sem
  // esta chamada o corpo de toda rota sai documentado como objeto vazio — e a
  // falha é silenciosa: o Swagger abre normalmente, só mente.
  patchNestJsSwagger();

  const config = new DocumentBuilder()
    .setTitle('ProntoMed API')
    .setDescription('Prontuário eletrônico — pacientes, agenda e anotações de consulta')
    .setVersion('1.0')
    // Sem rota autenticada até F2, mas o botão Authorize nasce junto do documento.
    .addBearerAuth()
    .build();

  // Caminho literal: o `setGlobalPrefix('api')` não alcança o Swagger.
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
