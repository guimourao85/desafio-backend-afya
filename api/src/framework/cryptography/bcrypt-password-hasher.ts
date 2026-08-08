import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

import { EnvironmentService } from '@/shared/environments/environment.service';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';

/**
 * Bcrypt como implementação da porta de senha. O custo vem de `BCRYPT_ROUNDS`
 * (mínimo 10, cobrado pelo schema de ambiente): hash rápido é hash quebrável, e o
 * custo precisa ser regulável sem recompilar.
 *
 * O custo fica gravado no próprio hash, então `compare` não precisa dele — hashes
 * antigos continuam válidos depois que o valor de ambiente sobe.
 */
@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly environment: EnvironmentService) {}

  hash(plain: string): Promise<string> {
    return hash(plain, this.environment.get('BCRYPT_ROUNDS'));
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}
