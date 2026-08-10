import { Test } from '@nestjs/testing';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { ResourceNotFoundError } from '@/shared/errors/types';

import {
  InMemoryPatientRepository,
  makePatient,
} from '../../../../../test/factories/in-memory-patient.repository';
import { FindPatientSummaryService } from './find-patient-summary.service';

/**
 * A API pública do módulo — a que `AppointmentsModule` injeta para consultar o
 * paciente sem atravessar a fronteira do agregado. Testada aqui, isolada do
 * consumidor: se ela nascer torta, a saída fácil lá será furar a fronteira.
 */
describe('FindPatientSummaryService', () => {
  let service: FindPatientSummaryService;
  let repository: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [FindPatientSummaryService, { provide: PATIENTS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(FindPatientSummaryService);
  });

  it('devolve só o que atravessa a fronteira: id, nome e se está ativo', async () => {
    const patient = makePatient();
    repository.items.push(patient);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect(result.isRight()).toBe(true);
    // Igualdade de chaves: telefone, email e nascimento não têm o que fazer do
    // outro lado, e campo novo na entity não vaza por descuido.
    expect(Object.keys(result.value as object).sort()).toEqual(['id', 'isAnonymized', 'name']);
  });

  it('denuncia o paciente anonimizado, para quem precisa recusar a operação (INV-02)', async () => {
    const patient = makePatient({ anonymizedAt: new Date('2026-08-09T12:00:00.000Z') });
    repository.items.push(patient);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: patient.id });

    expect((result.value as { isAnonymized: boolean }).isAnonymized).toBe(true);
  });

  it('responde 404 para paciente de outro médico', async () => {
    const alheio = makePatient({ doctorId: 'doctor-2' });
    repository.items.push(alheio);

    const result = await service.execute({ doctorId: 'doctor-1', patientId: alheio.id });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
  });
});
