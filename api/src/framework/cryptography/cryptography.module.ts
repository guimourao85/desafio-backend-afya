import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { EnvironmentService } from '@/shared/environments/environment.service';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';
import { TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { BcryptPasswordHasher } from './bcrypt-password-hasher';
import { JwtTokenIssuer } from './jwt-token-issuer';

/**
 * O módulo que embrulha a criptografia concreta. **Nenhum outro módulo importa
 * `JwtModule`**: quem precisa de token importa este e injeta `TokenIssuer`.
 *
 * É aqui que o `JwtModule` é configurado, e é aqui — e só aqui — que o segredo é
 * lido, via `EnvironmentService`. `registerAsync` existe por causa disso: o
 * `register` síncrono obrigaria a ler `process.env` na avaliação do decorator,
 * antes de qualquer validação de ambiente ter rodado.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [EnvironmentService],
      useFactory: (environment: EnvironmentService) => ({
        secret: environment.get('JWT_SECRET'),
        signOptions: { expiresIn: environment.get('JWT_ACCESS_TTL') },
      }),
    }),
  ],
  providers: [
    // A porta é o token; o adapter é detalhe substituível.
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: TokenIssuer, useClass: JwtTokenIssuer },
  ],
  exports: [PasswordHasher, TokenIssuer],
})
export class CryptographyModule {}
