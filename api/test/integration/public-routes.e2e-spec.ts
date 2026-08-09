import { INestApplication, Type } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { IS_PUBLIC_KEY } from '@/framework/authentication/public.decorator';

/**
 * O teste que protege o **default** do guard global.
 *
 * Toda rota nasce autenticada, e abrir uma exige `@Public()`. O modo de errar isso
 * é silencioso: uma rota nova marcada como pública por copiar-e-colar não quebra
 * nada, e a suíte inteira segue verde com a API exposta. Aqui a lista é uma
 * **igualdade** — pública a mais reprova, pública a menos também.
 *
 * A enumeração usa `DiscoveryService`, que é metadado do Nest e API pública.
 * Vasculhar o `_router` do Express provaria o mesmo acoplado à versão do
 * transporte, e quebraria numa atualização sem defeito nenhum no produto.
 */
describe('Rotas públicas (e2e)', () => {
  let app: INestApplication;
  let discovery: DiscoveryService;
  let scanner: MetadataScanner;
  let reflector: Reflector;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // `DiscoveryModule` é quem provê o `DiscoveryService`; o `AppModule` não o importa.
      imports: [AppModule, DiscoveryModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    discovery = app.get(DiscoveryService);
    scanner = app.get(MetadataScanner);
    reflector = app.get(Reflector);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exatamente quatro handlers são públicos — e são estes', () => {
    const publicHandlers = discovery.getControllers().flatMap((wrapper) => {
      const instance = wrapper.instance as object | undefined;

      if (!instance) return [];

      const prototype = Object.getPrototypeOf(instance) as Record<string, () => unknown>;

      return scanner
        .getAllMethodNames(prototype)
        .filter((method) =>
          reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            prototype[method],
            wrapper.metatype as Type,
          ]),
        )
        .map((method) => `${wrapper.name}.${method}`);
    });

    expect(publicHandlers.sort()).toEqual([
      'AuthenticateDoctorController.handle',
      'HealthController.handle',
      'RefreshSessionController.handle',
      'RevokeSessionController.handle',
    ]);
  });
});
