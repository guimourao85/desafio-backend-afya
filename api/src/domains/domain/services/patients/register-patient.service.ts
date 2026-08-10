import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

import { Patient, PatientSex } from '../../model-entities/patient.entity';
import { PatientRepository } from '../../repositories/patient.repository';

export interface RegisterPatientRequest {
  /** Vem do token, via `@CurrentDoctor()` — nunca do corpo da requisição. (INV-04) */
  doctorId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** `'YYYY-MM-DD'`. Data pura: nascimento não tem hora nem fuso horário. */
  birthDate?: string | null;
  sex?: PatientSex | null;
  heightM?: number | null;
  weightKg?: number | null;
}

/**
 * Cadastra um paciente na base do médico autenticado.
 *
 * **Não devolve erro em caso nenhum**, e isso é escolha: formato inválido já morreu
 * na validação da borda, e não existe regra de negócio que recuse um cadastro — nem
 * email repetido, porque dois pacientes podem dividir o email de um familiar.
 *
 * Só o nome é obrigatório. O resto entra com o que o médico tiver em mãos na hora.
 *
 * Atende RF-01. Mais detalhes: PRODUCT.md — INV-04.
 */
@Injectable()
export class RegisterPatientService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  execute({ doctorId, ...data }: RegisterPatientRequest): Promise<Patient> {
    const patient = Object.assign(new Patient(), {
      doctorId,
      name: data.name,
      // `?? null` em vez de deixar `undefined`: a coluna aceita nulo, e `undefined`
      // faria o TypeORM **omitir o campo** do INSERT em vez de gravar NULL. A
      // diferença é sutil e só aparece depois, na leitura.
      phone: data.phone ?? null,
      email: data.email ?? null,
      birthDate: data.birthDate ?? null,
      sex: data.sex ?? null,
      heightM: data.heightM ?? null,
      weightKg: data.weightKg ?? null,
      anonymizedAt: null,
    });

    return this.patientRepository.create(patient);
  }
}
