/**
 * Resultado explícito de caso de uso (PLAN.md §11.1). O service devolve
 * `Left(erro)` para o que é esperado — paciente inexistente, horário ocupado — e
 * reserva `throw` para o que é defeito. Erro esperado que sobe como exceção some
 * da assinatura: quem chama não é obrigado a tratá-lo.
 */
export class Left<L, R> {
  constructor(readonly value: L) {}

  // O `this is` estreita o tipo de `value` no chamador: sem ele, ler o erro
  // depois de `isLeft()` exigiria cast.
  isLeft(): this is Left<L, R> {
    return true;
  }

  isRight(): this is Right<L, R> {
    return false;
  }
}

export class Right<L, R> {
  constructor(readonly value: R) {}

  isLeft(): this is Left<L, R> {
    return false;
  }

  isRight(): this is Right<L, R> {
    return true;
  }
}

export type Either<L, R> = Left<L, R> | Right<L, R>;

export const left = <L, R>(value: L): Either<L, R> => new Left(value);

export const right = <L, R>(value: R): Either<L, R> => new Right(value);
