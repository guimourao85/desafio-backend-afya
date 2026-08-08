import { Module } from '@nestjs/common';

import { CryptographyModule } from '@/framework/cryptography/cryptography.module';

import { AuthenticateDoctorService } from './authenticate-doctor.service';
import { authenticationProviders } from './authentication.provider';

/**
 * O contexto de autenticação: médico e sessão.
 *
 * Exporta **só o service**. Os dois tokens de repositório ficam privados de
 * propósito — outro módulo que precise de médico importa este e chama o caso de
 * uso; injetar `DOCTORS_REPOSITORY` de fora seria alcançar o banco de outro
 * agregado por baixo da regra.
 */
@Module({
  imports: [CryptographyModule],
  providers: [...authenticationProviders, AuthenticateDoctorService],
  exports: [AuthenticateDoctorService],
})
export class AuthenticationModule {}
