import { CustomDecorator, SetMetadata } from '@nestjs/common';

/** A chave que o `JwtAuthGuard` lê e que o teste de varredura de rotas enumera. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Abre uma rota que, por padrão, nasceria fechada (`APP_GUARD`).
 *
 * Rota pública é **decisão visível no código**, não ausência de configuração: as
 * quatro que existem — `health`, `login`, `refresh`, `logout` — estão marcadas
 * uma a uma, e o `public-routes.e2e-spec.ts` reprova a suíte se aparecer uma quinta.
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
