import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse } from '@nestjs/swagger';

/** Um item de `details[]`: qual campo do payload falhou, e por quê (PLAN.md §9.4). */
interface ValidationDetail {
  path: string;
  message: string;
}

interface ApiValidationErrorResponseOptions {
  /**
   * O exemplo de `details[]` **daquela rota** — um caso real, com o nome de campo
   * que aquele schema Zod tem. Omitir produz a forma sem `details`, que é a das
   * rotas de parâmetro puro.
   *
   * É a única parte que muda de rota para rota, e por isso é a única que o chamador
   * passa: um exemplo genérico documentaria `refreshToken` num `POST /patients`.
   */
  details?: ValidationDetail[];
  /** Sobrescreve a descrição quando a rota tem um caso mais informativo a contar. */
  description?: string;
}

const BODY_DESCRIPTION =
  'Payload rejeitado na borda pelo Zod: formato, tipo, campo obrigatório ausente ou campo desconhecido. `details[]` aponta o campo.';

/**
 * A outra forma do mesmo 400 — sem `details[]`, porque não há campo de payload a
 * apontar: o que falhou foi o `:id` do caminho.
 */
const PATH_PARAM_DESCRIPTION =
  'O `:id` do caminho não está no formato UUID. Este 400 **não** traz `details[]`: não há campo de payload a apontar.';

/**
 * O 400 de validação, documentado num lugar só (sprint 05.01, decisão 1).
 *
 * O envelope não é da rota: ele é produzido pelo `AllExceptionsFilter`
 * (`exception-filter.ts:86-97` e `:121-129`), sempre com o mesmo `statusCode`,
 * `code` e `message`. Repetir o bloco em quinze controllers é drift esperando
 * acontecer — muda a mensagem no filtro e quinze exemplos passam a mentir.
 *
 * **O 400 tem duas formas, e as duas nascem de pipes diferentes** (decisão 1'):
 *
 * 1. **Com `details[]`** — `@Body()` ou `@Query()` tipado com um `createZodDto`. O
 *    `ZodValidationPipe` global (PLAN.md §12.1) lança `ZodValidationException`, e o
 *    ramo 1 do filtro traduz cada `issue` do Zod em `{ path, message }`.
 * 2. **Sem `details[]`** — `@Param('id', ParseUUIDPipe)`. Quem recusa aqui é o
 *    `ParseUUIDPipe` do Nest, com uma `BadRequestException` que cai no ramo 4 do
 *    filtro: mesmo `code`, mesma mensagem, e nenhum `details`.
 *
 * **Não é o pipe global que valida o `:id`.** O `ZodValidationPipe` devolve o valor
 * intocado quando o metatype não é um `ZodDto` (`nestjs-zod/dist/index.js:944-947`),
 * e o metatype de `@Param('id')` é `String`. A consequência prática: rota de caminho
 * **sem** `ParseUUIDPipe` não ganha 400 nenhum — o texto solto chega ao Postgres e
 * volta como 500 do driver. Quem documentar uma rota `:id` com este decorator
 * precisa ter declarado o pipe primeiro.
 */
export function ApiValidationErrorResponse(
  options: ApiValidationErrorResponseOptions = {},
): ReturnType<typeof applyDecorators> {
  const { details, description } = options;

  return applyDecorators(
    ApiBadRequestResponse({
      description: description ?? (details ? BODY_DESCRIPTION : PATH_PARAM_DESCRIPTION),
      schema: {
        example: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Requisição inválida.',
          // Espalhado, e não `details`: na forma de parâmetro puro a chave não
          // existe no objeto, em vez de existir valendo `undefined`. O `details`
          // é opcional no envelope (PLAN.md §9.4), e o exemplo publica isso.
          ...(details ? { details } : {}),
        },
      },
    }),
  );
}
