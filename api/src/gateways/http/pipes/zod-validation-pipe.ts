import { createZodValidationPipe } from 'nestjs-zod';

/**
 * O pipe da borda, registrado como `APP_PIPE` (PLAN.md §12.1). Global de
 * propósito: validação opcional é validação ausente — na referência técnica o
 * pipe existe e é aplicado em 19% dos controllers.
 *
 * Sem schema no construtor: ele deriva o schema do DTO da própria rota
 * (`createZodDto`), e lança a `ZodValidationException` que o filtro reconhece.
 */
export const ZodValidationPipe = createZodValidationPipe();
