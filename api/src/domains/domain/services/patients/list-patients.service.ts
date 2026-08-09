import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

import { PatientPage, PatientRepository } from '../../repositories/patient.repository';

export interface ListPatientsRequest {
  doctorId: string;
  search?: string;
  page: number;
  perPage: number;
}

/**
 * Lista os pacientes do médico autenticado, com busca por nome (RF-02).
 *
 * Sem `Either`: lista vazia é resultado legítimo, não erro — `{ data: [], total: 0 }`
 * com 200, nunca 404. Página além do fim também devolve vazio, e não estouro.
 *
 * O caso de uso não conhece `totalPages`: quantas páginas existem é aritmética de
 * apresentação, e vive no `PaginatedPresenter`. Aqui moram os dados; lá, o formato.
 */
@Injectable()
export class ListPatientsService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  execute({ doctorId, search, page, perPage }: ListPatientsRequest): Promise<PatientPage> {
    return this.patientRepository.list({ doctorId, search, page, perPage });
  }
}
