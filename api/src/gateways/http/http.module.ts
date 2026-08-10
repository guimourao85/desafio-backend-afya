import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';

import { AuthenticationModule } from '@/domains/domain/services/authentication/authentication.module';
import { AppointmentsModule } from '@/domains/domain/services/appointments/appointments.module';
import { PatientsModule } from '@/domains/domain/services/patients/patients.module';
import { JwtAuthGuard } from '@/framework/authentication/jwt-auth.guard';
import { CryptographyModule } from '@/framework/cryptography/cryptography.module';

import { HealthController } from './controllers/core';
import {
  AuthenticateDoctorController,
  GetProfileController,
  RefreshSessionController,
  RevokeSessionController,
} from './controllers/domain/authentication';
import {
  AddConsultationNoteController,
  CancelAppointmentController,
  GetAppointmentController,
  GetPatientTimelineController,
  ListAppointmentsController,
  ScheduleAppointmentController,
  UpdateAppointmentController,
} from './controllers/domain/appointments';
import {
  AnonymizePatientController,
  GetPatientController,
  ListPatientsController,
  RegisterPatientController,
  UpdatePatientController,
} from './controllers/domain/patients';
import { ZodValidationPipe } from './pipes/zod-validation-pipe';

/**
 * Concentra o transporte: controllers, o pipe global e o `APP_GUARD`. Controller
 * não mora em módulo de domínio — regra e transporte não se misturam.
 *
 * Importa o **módulo** de autenticação, nunca os tokens de repositório dele: a
 * fronteira do agregado é o que o módulo exporta.
 *
 * `CryptographyModule` entra porque o `APP_GUARD` é instanciado **neste** módulo e
 * injeta a porta `TokenIssuer`. O `JwtModule` continua invisível fora do
 * `CryptographyModule` — quem precisa verificar token pede a porta, não a lib.
 */
@Module({
  imports: [AuthenticationModule, CryptographyModule, PatientsModule, AppointmentsModule],
  controllers: [
    HealthController,
    AuthenticateDoctorController,
    RefreshSessionController,
    RevokeSessionController,
    GetProfileController,
    RegisterPatientController,
    ListPatientsController,
    GetPatientController,
    // Antes do `GetPatientController` seria indiferente — `:id` do Express não casa
    // com barra, então `/patients/:id` nunca disputa com `/patients/:id/appointments`.
    // Fica aqui por leitura: a linha do tempo é uma rota de paciente, ainda que o
    // controller viva no pacote de agendamentos (decisão 13).
    GetPatientTimelineController,
    UpdatePatientController,
    AnonymizePatientController,
    ScheduleAppointmentController,
    ListAppointmentsController,
    GetAppointmentController,
    UpdateAppointmentController,
    CancelAppointmentController,
    AddConsultationNoteController,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Toda rota nasce autenticada. Abrir uma exige `@Public()` explícito — e o
    // `public-routes.e2e-spec.ts` reprova a suíte se aparecer uma quinta.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class HttpModule {}
