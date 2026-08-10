import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { ResourceNotFoundError } from '@/shared/errors/types';

import {
  AppointmentPage,
  AppointmentRepository,
} from '../../repositories/appointment.repository';
import { FindPatientSummaryService } from '../patients/find-patient-summary.service';

export interface GetPatientTimelineRequest {
  doctorId: string;
  patientId: string;
  page: number;
  perPage: number;
}

export type GetPatientTimelineResult = Either<ResourceNotFoundError, AppointmentPage>;

/**
 * A história de atendimento de um paciente (RF-06) — a leitura que alimenta a tabela
 * "Data da consulta × Atendimento" do wireframe.
 *
 * Confere o paciente **antes** de tocar a agenda, e pelo service público do
 * `PatientsModule` (`PRODUCT.md §dominios`) — nunca por `PATIENTS_REPOSITORY` nem por
 * `JOIN` em `patients`. Dois ganhos, e nenhum é cerimônia: paciente inexistente e
 * paciente de outro consultório chegam aqui como o mesmo 404 sem esta classe
 * precisar conhecer INV-04, e uma timeline vazia passa a significar "sem consultas"
 * em vez de "sem paciente".
 *
 * Devolve `Either` por causa desse 404. A página em si nunca é erro: paciente sem
 * nenhuma consulta é 200 com lista vazia, e não 404 — o recurso existe, a história é
 * que ainda não começou.
 *
 * **Paciente anonimizado devolve a história normalmente** (INV-03): o direito ao
 * esquecimento apaga a identidade, não o registro do atendimento.
 */
@Injectable()
export class GetPatientTimelineService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    private readonly findPatientSummary: FindPatientSummaryService,
  ) {}

  async execute({
    doctorId,
    patientId,
    page,
    perPage,
  }: GetPatientTimelineRequest): Promise<GetPatientTimelineResult> {
    const patient = await this.findPatientSummary.execute({ doctorId, patientId });

    if (patient.isLeft()) {
      return left(patient.value);
    }

    return right(
      await this.appointmentRepository.listByPatientWithNotes({
        doctorId,
        patientId,
        page,
        perPage,
      }),
    );
  }
}
