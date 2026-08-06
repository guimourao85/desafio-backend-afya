import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Environment } from './environment';

/**
 * A única porta de entrada para configuração. Nada lê `process.env` fora daqui:
 * o valor já veio validado e tipado por `validateEnvironment`.
 */
@Injectable()
export class EnvironmentService {
  constructor(private readonly configService: ConfigService<Environment, true>) {}

  get<K extends keyof Environment>(key: K): Environment[K] {
    return this.configService.get(key, { infer: true });
  }

  get nodeEnv(): Environment['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  /** O ambiente do projeto (`dev` | `hmg` | `prod`) — não confundir com `nodeEnv`. */
  get appEnv(): Environment['APP_ENV'] {
    return this.get('APP_ENV');
  }

  get isDevelopment(): boolean {
    return this.appEnv === 'dev';
  }

  get port(): number {
    return this.get('PORT');
  }
}
