import { Test } from '@nestjs/testing';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { ResourceNotFoundError } from '@/shared/errors/types';

import {
  InMemoryPatientRepository,
  makePatient,
} from '../../../../../test/factories/in-memory-patient.repository';
import { GetPatientService } from './get-patient.service';

describe('GetPatientService', () => {
  let service: GetPatientService;
  let repository: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [GetPatientService, { provide: PATIENTS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(GetPatientService);
  });

  it('devolve o paciente do próprio médico', async () => {
    const patient = makePatient({ doctorId: 'doctor-1' });
    repository.items.push(patient);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect(result.isRight()).toBe(true);
    expect(result.value).toBe(patient);
  });

  // INV-04 — o teste que só fica vermelho se o filtro por médico sumir.
  it('responde 404 para paciente de outro médico, igual ao inexistente', async () => {
    const alheio = makePatient({ doctorId: 'doctor-2' });
    repository.items.push(alheio);

    const doOutro = await service.execute({ doctorId: 'doctor-1', patientId: alheio.id });
    const inexistente = await service.execute({ doctorId: 'doctor-1', patientId: 'nao-existe' });

    expect(doOutro.isLeft()).toBe(true);
    expect(doOutro.value).toBeInstanceOf(ResourceNotFoundError);
    // Byte a byte: qualquer diferença aqui vira um oráculo de "este id existe".
    expect((doOutro.value as ResourceNotFoundError).message).toBe(
      (inexistente.value as ResourceNotFoundError).message,
    );
  });

  it('devolve o paciente anonimizado — ele existe, só está inativo', async () => {
    const patient = makePatient({ anonymizedAt: new Date('2026-08-09T12:00:00.000Z') });
    repository.items.push(patient);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect(result.isRight()).toBe(true);
  });
});
