import { Module } from '@nestjs/common';

import { PatientsModule } from '../patients/patients.module';
import { AddConsultationNoteService } from './add-consultation-note.service';
import { appointmentsProviders } from './appointments.provider';
import { CancelAppointmentService } from './cancel-appointment.service';
import { GetAppointmentService } from './get-appointment.service';
import { GetPatientTimelineService } from './get-patient-timeline.service';
import { ListAppointmentsService } from './list-appointments.service';
import { ScheduleAppointmentService } from './schedule-appointment.service';
import { UpdateAppointmentService } from './update-appointment.service';

/**
 * O contexto de agenda — o **primeiro módulo de domínio que importa outro**.
 *
 * Importa `PatientsModule` e injeta `FindPatientSummaryService`: a travessia
 * acontece pela API pública do outro módulo, nunca pelo `PATIENTS_REPOSITORY` nem
 * por `JOIN` em `patients` (`PRODUCT.md §dominios`). É aqui que a fronteira entre
 * agregados é testada pela primeira vez, e o caminho fácil — pedir o repositório
 * alheio — é exatamente o que ela existe para impedir.
 */
@Module({
  imports: [PatientsModule],
  providers: [
    ...appointmentsProviders,
    ScheduleAppointmentService,
    ListAppointmentsService,
    GetAppointmentService,
    UpdateAppointmentService,
    CancelAppointmentService,
    AddConsultationNoteService,
    GetPatientTimelineService,
  ],
  exports: [
    ScheduleAppointmentService,
    ListAppointmentsService,
    GetAppointmentService,
    UpdateAppointmentService,
    CancelAppointmentService,
    AddConsultationNoteService,
    // Exportado por este módulo, e não pelo `PatientsModule`, mesmo servindo a uma
    // URL de paciente: o dado é do agregado `Appointment`. A rota segue o cliente,
    // o código segue o agregado (sprint 04.02, decisão 13).
    GetPatientTimelineService,
  ],
})
export class AppointmentsModule {}
