import { Test } from '@nestjs/testing';

import { PATIENTS_REPOSITORY } from '@/shared/constants/repositories';

import { InMemoryPatientRepository } from '../../../../../test/factories/in-memory-patient.repository';
import { PatientSex } from '../../model-entities/patient.entity';
import { RegisterPatientService } from './register-patient.service';

describe('RegisterPatientService', () => {
  let service: RegisterPatientService;
  let repository: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [RegisterPatientService, { provide: PATIENTS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(RegisterPatientService);
  });

  it('vincula o paciente ao médico do token', async () => {
    const patient = await service.execute({ doctorId: 'doctor-1', name: 'Pedro Álvares' });

    expect(patient.doctorId).toBe('doctor-1');
    expect(repository.items).toHaveLength(1);
  });

  it('cadastra só com o nome — todo o resto é opcional', async () => {
    const patient = await service.execute({ doctorId: 'doctor-1', name: 'Minimo Viavel' });

    // `null` explícito, não `undefined`: `undefined` faria o TypeORM omitir a
    // coluna do INSERT em vez de gravar NULL.
    expect(patient.phone).toBeNull();
    expect(patient.email).toBeNull();
    expect(patient.birthDate).toBeNull();
    expect(patient.sex).toBeNull();
    expect(patient.heightM).toBeNull();
    expect(patient.weightKg).toBeNull();
  });

  it('nasce ativo — nunca anonimizado', async () => {
    const patient = await service.execute({ doctorId: 'doctor-1', name: 'Pedro' });

    expect(patient.anonymizedAt).toBeNull();
    expect(patient.isAnonymized()).toBe(false);
  });

  it('grava os campos clínicos como vieram', async () => {
    const patient = await service.execute({
      doctorId: 'doctor-1',
      name: 'Pedro Álvares',
      sex: PatientSex.MALE,
      heightM: 1.68,
      weightKg: 75,
      birthDate: '1987-01-01',
    });

    expect(patient.heightM).toBe(1.68);
    expect(patient.birthDate).toBe('1987-01-01');
  });
});
