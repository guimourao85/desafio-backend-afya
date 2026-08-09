import { Test } from '@nestjs/testing';

import { DOCTORS_REPOSITORY } from '@/shared/constants/repositories';
import { UnauthenticatedError } from '@/shared/errors/types';

import { Doctor } from '../../model-entities/doctor.entity';
import { DoctorRepository } from '../../repositories/doctor.repository';
import { GetProfileService } from './get-profile.service';

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';
const FIXED_NOW = new Date('2026-08-08T12:00:00.000Z');

class InMemoryDoctorRepository implements DoctorRepository {
  readonly items: Doctor[] = [];

  async findByEmail(email: string): Promise<Doctor | null> {
    return this.items.find((doctor) => doctor.email === email) ?? null;
  }

  async findById(id: string): Promise<Doctor | null> {
    return this.items.find((doctor) => doctor.id === id) ?? null;
  }
}

describe('GetProfileService', () => {
  let service: GetProfileService;
  let doctorRepository: InMemoryDoctorRepository;

  beforeEach(async () => {
    doctorRepository = new InMemoryDoctorRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetProfileService,
        { provide: DOCTORS_REPOSITORY, useValue: doctorRepository },
      ],
    }).compile();

    service = moduleRef.get(GetProfileService);

    doctorRepository.items.push(
      Object.assign(new Doctor(), {
        id: DOCTOR_ID,
        name: 'Dra. Helena Prado',
        email: 'helena@prontomed.dev',
        passwordHash: 'hashed:senha-correta',
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      }),
    );
  });

  it('devolve o perfil do médico do token', async () => {
    const result = await service.execute({ doctorId: DOCTOR_ID });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({
      id: DOCTOR_ID,
      name: 'Dra. Helena Prado',
      email: 'helena@prontomed.dev',
    });
  });

  it('não deixa `passwordHash` sair do caso de uso (INV-07)', async () => {
    const result = await service.execute({ doctorId: DOCTOR_ID });

    // Igualdade de chaves, não `not.toHaveProperty`: campo novo na entity que
    // vazasse por descuido reprovaria aqui, sem ninguém precisar prevê-lo.
    expect(Object.keys(result.value as object).sort()).toEqual(['email', 'id', 'name']);
  });

  it('recusa token válido de médico que não existe mais — 401, não 404', async () => {
    doctorRepository.items.length = 0;

    const result = await service.execute({ doctorId: DOCTOR_ID });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(UnauthenticatedError);
  });
});
