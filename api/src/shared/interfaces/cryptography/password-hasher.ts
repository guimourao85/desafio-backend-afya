/**
 * A porta de hash de senha (PLAN.md §8.4). O caso de uso conhece só este contrato:
 * qual algoritmo, com qual custo, é decisão de infraestrutura — e trocá-lo não pode
 * exigir tocar em regra de negócio.
 *
 * Classe abstrata e não `interface`: `interface` some na compilação e não serve de
 * token de DI. Assim o Nest injeta pela própria classe, sem `@Inject('STRING')`.
 */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;

  abstract compare(plain: string, hash: string): Promise<boolean>;
}
