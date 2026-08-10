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
 * Lista os pacientes do médico autenticado, com busca por nome.
 *
 * **Não devolve erro em caso nenhum:** lista vazia é resultado legítimo — 200 com
 * lista vazia, nunca 404. Pedir uma página além do fim também devolve vazio, em vez
 * de estourar.
 *
 * O caso de uso não sabe quantas páginas existem: isso é aritmética de tela, e é
 * calculado só na hora de montar a resposta. Aqui moram os dados; o formato mora lá.
 *
 * Atende RF-02. Mais detalhes: PRODUCT.md — INV-04.
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
