import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

import { Patient, PatientSex } from '../../model-entities/patient.entity';
import { PatientRepository } from '../../repositories/patient.repository';

export interface RegisterPatientRequest {
  /** Vem do token, via `@CurrentDoctor()` — nunca do payload (INV-04). */
  doctorId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** `'YYYY-MM-DD'` — coluna `date`, sem hora e sem fuso. */
  birthDate?: string | null;
  sex?: PatientSex | null;
  heightM?: number | null;
  weightKg?: number | null;
}

/**
 * Cadastra um paciente na base do médico autenticado (RF-01).
 *
 * **Sem `Either`**, pela mesma razão do `RevokeSessionService`: não há erro
 * esperado. Formato inválido morre na borda Zod, e não há regra de negócio que
 * recuse um cadastro — nem unicidade de email (dois pacientes podem dividir o email
 * de um familiar). Um `Left` de tipo `never` obrigaria todo controller a escrever um
 * ramo morto.
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
      // `?? null` em vez de deixar `undefined`: a coluna é nula, e `undefined`
      // faria o TypeORM omitir o campo do INSERT em vez de gravar NULL.
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
