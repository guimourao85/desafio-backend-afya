import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';

import { AppointmentStatus } from '../../model-entities/appointment.entity';
import {
  AppointmentPage,
  AppointmentRepository,
} from '../../repositories/appointment.repository';

export interface ListAppointmentsRequest {
  doctorId: string;
  from?: Date;
  to?: Date;
  patientId?: string;
  status?: AppointmentStatus;
  page: number;
  perPage: number;
}

/**
 * A agenda do médico, com filtros combináveis (RF-04).
 *
 * Sem `Either`: agenda vazia é resultado legítimo. Todos os filtros são opcionais —
 * sem nenhum, a rota devolve a agenda inteira paginada, que é o que a tela inicial
 * do wireframe mostra.
 */
@Injectable()
export class ListAppointmentsService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  execute(request: ListAppointmentsRequest): Promise<AppointmentPage> {
    return this.appointmentRepository.list(request);
  }
}
