import { Test } from '@nestjs/testing';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { ResourceNotFoundError } from '@/shared/errors/types';

import {
  InMemoryPatientRepository,
  makePatient,
} from '../../../../../test/factories/in-memory-patient.repository';
import { ANONYMIZED_PATIENT_NAME, PatientSex } from '../../model-entities/patient.entity';
import { AnonymizePatientService } from './anonymize-patient.service';

describe('AnonymizePatientService', () => {
  let service: AnonymizePatientService;
  let repository: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [AnonymizePatientService, { provide: PATIENTS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(AnonymizePatientService);
  });

  it('apaga a identificação e carimba a data', async () => {
    const patient = makePatient();
    repository.items.push(patient);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect(result.isRight()).toBe(true);
    expect(patient.name).toBe(ANONYMIZED_PATIENT_NAME);
    expect(patient.phone).toBeNull();
    expect(patient.email).toBeNull();
    expect(patient.birthDate).toBeNull();
    expect(patient.anonymizedAt).toBeInstanceOf(Date);
    expect(patient.isAnonymized()).toBe(true);
  });

  // INV-03 — o outro lado da mesma regra: apagar demais destrói valor clínico.
  it('preserva sexo, medidas e a data de cadastro', async () => {
    const patient = makePatient({ sex: PatientSex.MALE, heightM: 1.68, weightKg: 75 });
    const createdAt = patient.createdAt;
    repository.items.push(patient);

    await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect(patient.sex).toBe(PatientSex.MALE);
    expect(patient.heightM).toBe(1.68);
    expect(patient.weightKg).toBe(75);
    expect(patient.createdAt).toBe(createdAt);
  });

  it('é idempotente: a segunda chamada não reescreve o carimbo', async () => {
    const patient = makePatient();
    repository.items.push(patient);

    await service.execute({ doctorId: 'doctor-1', patientId: patient.id });
    const primeiroCarimbo = patient.anonymizedAt;

    const segunda = await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect(segunda.isRight()).toBe(true);
    // **Quando** o direito foi exercido é dado de conformidade: não muda porque a
    // rede repetiu a requisição.
    expect(patient.anonymizedAt).toBe(primeiroCarimbo);
  });

  it('responde 404 para paciente de outro médico — e não anonimiza a linha alheia', async () => {
    const alheio = makePatient({ doctorId: 'doctor-2', name: 'Paciente do Outro' });
    repository.items.push(alheio);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: alheio.id });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
    expect(alheio.name).toBe('Paciente do Outro');
    expect(alheio.anonymizedAt).toBeNull();
  });
});
