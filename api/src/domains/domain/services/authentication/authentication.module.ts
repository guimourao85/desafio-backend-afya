import { Module } from '@nestjs/common';

import { CryptographyModule } from '@/framework/cryptography/cryptography.module';

import { AuthenticateDoctorService } from './authenticate-doctor.service';
import { authenticationProviders } from './authentication.provider';
import { GetProfileService } from './get-profile.service';
import { RefreshSessionService } from './refresh-session.service';
import { RevokeSessionService } from './revoke-session.service';

/**
 * O contexto de autenticação: médico e sessão.
 *
 * Exporta **só os casos de uso**, nunca o acesso direto às tabelas. Os dois tokens
 * de repositório ficam privados de propósito: publicá-los daria a qualquer outro
 * módulo as tabelas de médico e de sessão por baixo de toda regra desta pasta.
 *
 * Quem precisa de médico importa este módulo e chama o caso de uso.
 *
 * Mais detalhes: PRODUCT.md — §dominios.
 */
@Module({
  imports: [CryptographyModule],
  providers: [
    ...authenticationProviders,
    AuthenticateDoctorService,
    RefreshSessionService,
    RevokeSessionService,
    GetProfileService,
  ],
  exports: [
    AuthenticateDoctorService,
    RefreshSessionService,
    RevokeSessionService,
    GetProfileService,
  ],
})
export class AuthenticationModule {}
