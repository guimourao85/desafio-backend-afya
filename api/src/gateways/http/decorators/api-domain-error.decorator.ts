import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

/**
 * Os três erros de domínio que as rotas documentam à mão. O `code` é fixo por status
 * — 404 é sempre `RESOURCE_NOT_FOUND`, 409 sempre `SCHEDULE_CONFLICT`, 422 sempre
 * `BUSINESS_RULE_VIOLATION` —, e só a descrição e a mensagem mudam por rota.
 *
 * Vivem num arquivo só porque são a mesma forma três vezes: separá-los seria repetir
 * o mesmo `schema.example` em três lugares para ganhar nada.
 */
interface DomainError {
  /** O texto do bloco no Swagger — o que o avaliador lê antes de expandir. */
  description: string;
  /** A `message` do corpo, igual à que o serviço devolve. */
  message: string;
}

const body = (statusCode: number, code: string, message: string) => ({
  schema: { example: { statusCode, code, message } },
});

export function ApiNotFoundErrorResponse({ description, message }: DomainError) {
  return applyDecorators(
    ApiNotFoundResponse({ description, ...body(404, 'RESOURCE_NOT_FOUND', message) }),
  );
}

export function ApiConflictErrorResponse({ description, message }: DomainError) {
  return applyDecorators(
    ApiConflictResponse({ description, ...body(409, 'SCHEDULE_CONFLICT', message) }),
  );
}

export function ApiBusinessRuleErrorResponse({ description, message }: DomainError) {
  return applyDecorators(
    ApiUnprocessableEntityResponse({
      description,
      ...body(422, 'BUSINESS_RULE_VIOLATION', message),
    }),
  );
}
