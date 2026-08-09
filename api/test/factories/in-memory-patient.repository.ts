import { Patient, PatientSex } from '@/domains/domain/model-entities/patient.entity';
import {
  ListPatientsFilters,
  PatientPage,
  PatientRepository,
} from '@/domains/domain/repositories/patient.repository';

let sequence = 0;

/**
 * Cria um paciente já "persistido" — com id e carimbos, como o banco devolveria.
 * O id é sequencial e determinístico: teste que depende de UUID aleatório falha
 * sozinho um dia, e nenhuma asserção daqui precisa de um id imprevisível.
 */
export function makePatient(overrides: Partial<Patient> = {}): Patient {
  sequence += 1;

  return Object.assign(new Patient(), {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    doctorId: 'doctor-1',
    name: 'Pedro Álvares',
    phone: '(11) 99999-9999',
    email: 'pedro@example.com',
    birthDate: '1987-01-01',
    sex: PatientSex.MALE,
    heightM: 1.68,
    weightKg: 75,
    anonymizedAt: null,
    createdAt: new Date('2026-08-09T12:00:00.000Z'),
    updatedAt: new Date('2026-08-09T12:00:00.000Z'),
    ...overrides,
  });
}

/**
 * O duplo da porta de paciente, usado por todos os specs de `services/patients`.
 *
 * Implementa o **contrato inteiro**, com a mesma semântica do adapter real —
 * inclusive o escopo por médico, que é o ponto: um in-memory que ignorasse
 * `doctorId` deixaria os testes de INV-04 passarem por construção, provando o
 * oposto do pretendido.
 *
 * Vive em `test/` porque `tsconfig.build.json` exclui essa pasta: duplo de teste
 * não chega ao `dist/`.
 */
export class InMemoryPatientRepository implements PatientRepository {
  readonly items: Patient[] = [];

  async create(patient: Patient): Promise<Patient> {
    const persisted = Object.assign(makePatient(), patient, {
      id: `00000000-0000-4000-8000-${String(this.items.length + 900).padStart(12, '0')}`,
    });

    this.items.push(persisted);

    return persisted;
  }

  async save(patient: Patient, doctorId: string): Promise<Patient> {
    const index = this.items.findIndex(
      (item) => item.id === patient.id && item.doctorId === doctorId,
    );

    // Espelha o `UPDATE … WHERE (id, doctor_id)`: sem a linha do dono, nada muda.
    if (index >= 0) this.items[index] = patient;

    return patient;
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Patient | null> {
    return this.items.find((item) => item.id === id && item.doctorId === doctorId) ?? null;
  }

  async list({ doctorId, search, page, perPage }: ListPatientsFilters): Promise<PatientPage> {
    const scoped = this.items
      .filter((item) => item.doctorId === doctorId)
      .filter((item) => !search || item.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      items: scoped.slice((page - 1) * perPage, page * perPage),
      // `total` é do conjunto filtrado, não da página — é o que alimenta `totalPages`.
      total: scoped.length,
    };
  }
}
