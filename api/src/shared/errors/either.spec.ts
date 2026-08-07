import { Either, left, right } from './either';

describe('Either', () => {
  it('left carrega o erro e se identifica como esquerda', () => {
    const result = left<string, number>('falhou');

    expect(result.isLeft()).toBe(true);
    expect(result.isRight()).toBe(false);
    expect(result.value).toBe('falhou');
  });

  it('right carrega o sucesso e se identifica como direita', () => {
    const result = right<string, number>(42);

    expect(result.isRight()).toBe(true);
    expect(result.isLeft()).toBe(false);
    expect(result.value).toBe(42);
  });

  // O motivo de existir dos predicados: sem o `this is`, o chamador precisaria de
  // cast para ler `value`, e o compilador deixaria de cobrar o tratamento do erro.
  it('estreita o tipo de `value` conforme o ramo — a garantia é do compilador', () => {
    const execute = (fail: boolean): Either<Error, { id: string }> =>
      fail ? left(new Error('não encontrado')) : right({ id: 'abc' });

    const failure = execute(true);
    const success = execute(false);

    if (failure.isLeft()) {
      expect(failure.value.message).toBe('não encontrado');
    } else {
      throw new Error('ramo inalcançável');
    }

    if (success.isRight()) {
      expect(success.value.id).toBe('abc');
    } else {
      throw new Error('ramo inalcançável');
    }
  });
});
