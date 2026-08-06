import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HttpModule } from '@/gateways/http/http.module';
import { validateEnvironment } from '@/shared/environments/environment';
import { EnvironmentModule } from '@/shared/environments/environment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    EnvironmentModule,
    HttpModule,
  ],
})
export class AppModule {}
