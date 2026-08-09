import { Patient, PatientSex } from '@/domains/domain/model-entities/patient.entity';

/** O corpo de toda resposta que devolve um paciente (PLAN.md §9.2). */
export interface PatientHttpResponse {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** `'1987-01-01'` — data pura, sem hora e sem fuso. */
  birthDate: string | null;
  sex: PatientSex | null;
  /** Número, não string: a coluna é `numeric` e o transformer já converteu. */
  heightM: number | null;
  weightKg: number | null;
  anonymized: boolean;
  createdAt: string;
}

/**
 * A via de serialização do paciente.
 *
 * Duas colunas ficam de fora, cada uma por sua razão: `doctorId` é interno — o
 * cliente já sabe de quem é a base, já que só vê a sua — e `anonymizedAt` vira o
 * booleano `anonymized`. **Quando** o direito ao esquecimento foi exercido é dado de
 * conformidade; o que o cliente precisa saber é que o perfil está inativo.
 */
export class PatientPresenter {
  static toHttp(patient: Patient): PatientHttpResponse {
    return {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      birthDate: patient.birthDate,
      sex: patient.sex,
      heightM: patient.heightM,
      weightKg: patient.weightKg,
      anonymized: patient.isAnonymized(),
      createdAt: patient.createdAt.toISOString(),
    };
  }
}
