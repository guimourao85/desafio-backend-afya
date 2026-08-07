import { INestApplication } from '@nestjs/common';

import { AllExceptionsFilter } from '@/framework/filters/errors/exception-filter';

/**
 * O que define o **contrato HTTP**: prefixo e envelope de erro. Vive fora do
 * `bootstrap()` para que o e2e use esta configuração em vez de reproduzi-la —
 * enquanto cada teste repetia as duas linhas, apagar o filtro do `main.ts`
 * deixava a suíte verde.
 *
 * Ferramenta de desenvolvimento (Swagger, em F6) fica no `bootstrap()`: e2e não
 * precisa montar OpenAPI para responder a uma requisição.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  // Instanciado à mão, não por `APP_FILTER`: o filtro não injeta nada — cria o
  // próprio `Logger`. Registrar por DI só se passar a depender de um serviço.
  app.useGlobalFilters(new AllExceptionsFilter());
}
