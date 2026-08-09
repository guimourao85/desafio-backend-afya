import { Test } from '@nestjs/testing';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

import {
  InMemoryPatientRepository,
  makePatient,
} from '../../../../../test/factories/in-memory-patient.repository';
import { ListPatientsService } from './list-patients.service';

describe('ListPatientsService', () => {
  let service: ListPatientsService;
  let repository: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [ListPatientsService, { provide: PATIENTS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(ListPatientsService);
  });

  // INV-04 na listagem: aqui o vazamento não seria um recurso, seria a base inteira.
  it('lista só os pacientes do médico, e conta só os dele', async () => {
    repository.items.push(
      makePatient({ doctorId: 'doctor-1', name: 'Ana' }),
      makePatient({ doctorId: 'doctor-1', name: 'Bruno' }),
      makePatient({ doctorId: 'doctor-2', name: 'Carlos' }),
    );

    const { items, total } = await service.execute({ doctorId: 'doctor-1', page: 1, perPage: 20 });

    expect(items.map((p) => p.name)).toEqual(['Ana', 'Bruno']);
    expect(total).toBe(2);
  });

  it('busca por nome ignorando caixa', async () => {
    repository.items.push(
      makePatient({ name: 'Pedro Álvares' }),
      makePatient({ name: 'Eduardo Silva' }),
    );

    const { items } = await service.execute({
      doctorId: 'doctor-1',
      search: 'PEDRO',
      page: 1,
      perPage: 20,
    });

    expect(items.map((p) => p.name)).toEqual(['Pedro Álvares']);
  });

  it('pagina, e `total` continua sendo do conjunto inteiro', async () => {
    repository.items.push(
      makePatient({ name: 'Ana' }),
      makePatient({ name: 'Bruno' }),
      makePatient({ name: 'Carlos' }),
    );

    const { items, total } = await service.execute({ doctorId: 'doctor-1', page: 2, perPage: 2 });

    expect(items.map((p) => p.name)).toEqual(['Carlos']);
    // Se `total` fosse o da página, `totalPages` sairia 1 e a paginação mentiria.
    expect(total).toBe(3);
  });

  it('base vazia devolve lista vazia — não é erro', async () => {
    const { items, total } = await service.execute({ doctorId: 'doctor-1', page: 1, perPage: 20 });

    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  it('página além do fim devolve vazio, sem estourar', async () => {
    repository.items.push(makePatient({ name: 'Ana' }));

    const { items, total } = await service.execute({ doctorId: 'doctor-1', page: 99, perPage: 20 });

    expect(items).toEqual([]);
    expect(total).toBe(1);
  });
});
