import { Inject, Injectable } from '@nestjs/common';

import { DOCTORS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { UnauthenticatedError } from '@/shared/errors/types';

import { DoctorRepository } from '../../repositories/doctor.repository';

export interface GetProfileRequest {
  /** Vem do token, via `@CurrentDoctor()` — nunca do payload (INV-04). */
  doctorId: string;
}

/**
 * O que o caso de uso deixa sair do domínio. **Não é a entity `Doctor`**: ela
 * carrega `passwordHash`, e INV-07 é cobrada no retorno do caso de uso, não só na
 * resposta HTTP. Devolver a entity faria do presenter a única defesa — e presenter
 * é justamente o lugar onde se esquece de tirar um campo.
 */
export interface DoctorProfile {
  id: string;
  name: string;
  email: string;
}

export type GetProfileResult = Either<UnauthenticatedError, DoctorProfile>;

/** Mesmo texto do 401 do `JwtAuthGuard` — ver a nota em `refresh-session.service.ts`. */
const UNAUTHENTICATED_MESSAGE = 'Autenticação necessária.';

/**
 * O perfil do médico autenticado (PLAN.md §8.2).
 *
 * Vai ao banco em vez de servir o payload do token: o `name` não está lá, e
 * colocá-lo inflaria o JWT e criaria uma cópia que envelhece — o médico troca o
 * nome e o token continuaria dizendo o antigo por 15 minutos.
 */
@Injectable()
export class GetProfileService {
  constructor(
    @Inject(DOCTORS_REPOSITORY)
    private readonly doctorRepository: DoctorRepository,
  ) {}

  async execute({ doctorId }: GetProfileRequest): Promise<GetProfileResult> {
    const doctor = await this.doctorRepository.findById(doctorId);

    if (!doctor) {
      // Token assinado por nós apontando para um médico que não existe mais: é a
      // sessão que não vale, não um recurso alheio (que seria o 404 de INV-04).
      return left(new UnauthenticatedError(UNAUTHENTICATED_MESSAGE));
    }

    return right({ id: doctor.id, name: doctor.name, email: doctor.email });
  }
}
