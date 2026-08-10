import { Inject, Injectable } from '@nestjs/common';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import { Patient, PatientSex } from '../../model-entities/patient.entity';
import { PatientRepository } from '../../repositories/patient.repository';
import { PATIENT_NOT_FOUND_MESSAGE } from './get-patient.service';

export interface UpdatePatientRequest {
  doctorId: string;
  patientId: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  sex?: PatientSex | null;
  heightM?: number | null;
  weightKg?: number | null;
}

export type UpdatePatientResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError,
  Patient
>;

/**
 * Paciente anonimizado virou registro contábil sem identidade, não perfil ativo —
 * ele existe para o histórico fazer sentido, não para ser editado. (INV-02)
 */
const ANONYMIZED_PATIENT_MESSAGE = 'Paciente anonimizado (LGPD) não pode ser editado.';

/**
 * Corrige o cadastro de um paciente.
 *
 * `PATCH` de verdade: só os campos que vieram na requisição mudam. A diferença
 * entre "não veio" e "veio nulo" é significativa aqui — `phone: null` **apaga** o
 * telefone, enquanto não mandar `phone` o deixa como estava.
 *
 * É por isso que as checagens lá embaixo são `!== undefined` e não um `??`: um `??`
 * trataria `null` e ausência como a mesma coisa, e apagar um campo viraria
 * impossível.
 *
 * Atende RF-02. Mais detalhes: PRODUCT.md — INV-02, INV-04.
 */
@Injectable()
export class UpdatePatientService {
  constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly patientRepository: PatientRepository,
  ) {}

  async execute({
    doctorId,
    patientId,
    ...changes
  }: UpdatePatientRequest): Promise<UpdatePatientResult> {
    const patient = await this.patientRepository.findByIdForDoctor(patientId, doctorId);

    if (!patient) {
      return left(new ResourceNotFoundError(PATIENT_NOT_FOUND_MESSAGE));
    }

    if (patient.isAnonymized()) {
      // 422 e não 404: o paciente **existe** — a recusa é de regra de negócio, não
      // de "não achei". Aceitar a edição reintroduziria dado pessoal pela porta dos
      // fundos, desfazendo o esquecimento que alguém pediu.
      return left(new BusinessRuleViolationError(ANONYMIZED_PATIENT_MESSAGE));
    }

    // Campo a campo, e sempre `!== undefined` — é o que separa "apagar o telefone"
    // de "não mexer no telefone". Ver a nota no cabeçalho.
    if (changes.name !== undefined) patient.name = changes.name;
    if (changes.phone !== undefined) patient.phone = changes.phone;
    if (changes.email !== undefined) patient.email = changes.email;
    if (changes.birthDate !== undefined) patient.birthDate = changes.birthDate;
    if (changes.sex !== undefined) patient.sex = changes.sex;
    if (changes.heightM !== undefined) patient.heightM = changes.heightM;
    if (changes.weightKg !== undefined) patient.weightKg = changes.weightKg;

    return right(await this.patientRepository.save(patient, doctorId));
  }
}
