import { Test } from '@nestjs/testing';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import {
  InMemoryPatientRepository,
  makePatient,
} from '../../../../../test/factories/in-memory-patient.repository';
import { UpdatePatientService } from './update-patient.service';

describe('UpdatePatientService', () => {
  let service: UpdatePatientService;
  let repository: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [UpdatePatientService, { provide: PATIENTS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(UpdatePatientService);
  });

  it('altera só os campos enviados', async () => {
    const patient = makePatient({ name: 'Pedro Álvares', weightKg: 75 });
    repository.items.push(patient);

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: patient.id,
      weightKg: 76.5,
    });

    expect(result.isRight()).toBe(true);
    expect((result.value as typeof patient).weightKg).toBe(76.5);
    expect((result.value as typeof patient).name).toBe('Pedro Álvares');
  });

  // A diferença entre "não veio" e "veio nulo" é a razão de o service testar
  // `!== undefined` em vez de usar `??`.
  it('`null` apaga o campo; ausência preserva', async () => {
    const patient = makePatient({ phone: '(11) 99999-9999', email: 'pedro@example.com' });
    repository.items.push(patient);

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: patient.id,
      phone: null,
    });

    expect((result.value as typeof patient).phone).toBeNull();
    expect((result.value as typeof patient).email).toBe('pedro@example.com');
  });

  it('responde 404 para paciente de outro médico — e não altera a linha alheia', async () => {
    const alheio = makePatient({ doctorId: 'doctor-2', name: 'Paciente do Outro' });
    repository.items.push(alheio);

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: alheio.id,
      name: 'Invadido',
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
    expect(repository.items[0].name).toBe('Paciente do Outro');
  });

  // INV-02: paciente anonimizado não aceita edição.
  it('recusa edição de paciente anonimizado com 422, não com 404', async () => {
    const patient = makePatient({ anonymizedAt: new Date('2026-08-09T12:00:00.000Z') });
    repository.items.push(patient);

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: patient.id,
      name: 'Reidentificado',
    });

    expect(result.isLeft()).toBe(true);
    // 404 mentiria dizendo que não existe; 422 diz que existe e a regra recusa.
    expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
    expect(repository.items[0].name).not.toBe('Reidentificado');
  });
});
