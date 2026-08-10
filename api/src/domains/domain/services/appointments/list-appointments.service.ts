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
 * A agenda do médico, com filtros que se combinam: período, paciente e status.
 *
 * **Não devolve erro em caso nenhum**, e isso é escolha, não esquecimento: agenda
 * vazia é resultado legítimo — lista vazia com 200, nunca 404. Pedir uma página
 * além do fim também devolve vazio, em vez de estourar.
 *
 * Todos os filtros são opcionais. Sem nenhum, sai a agenda inteira paginada, que é
 * o que a tela inicial mostra.
 *
 * O método tem uma linha de propósito: não há regra de negócio numa listagem. Quem
 * sabe filtrar por médico, ordenar e paginar é a camada de persistência.
 *
 * Atende RF-04. Mais detalhes: PRODUCT.md — INV-04.
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
