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
 * O que sai do domínio — três campos, e só. **Não é o médico inteiro**: aquele
 * objeto carrega a senha embaralhada, e "senha nunca sai numa resposta" é cobrado
 * já aqui, e não só na hora de montar o JSON.
 *
 * Devolver o objeto inteiro funcionaria hoje e deixaria a última camada como única
 * defesa — que é justamente o lugar onde se esquece de tirar um campo novo. (INV-07)
 */
export interface DoctorProfile {
  id: string;
  name: string;
  email: string;
}

export type GetProfileResult = Either<UnauthenticatedError, DoctorProfile>;

/** O mesmo texto do 401 do guard — ver a nota em `refresh-session.service.ts`. */
const UNAUTHENTICATED_MESSAGE = 'Autenticação necessária.';

/**
 * O perfil do médico autenticado — o "quem sou eu" que o front chama depois do
 * login.
 *
 * Vai ao banco em vez de servir o que já está dentro do token, porque o nome não
 * está lá. Colocá-lo no token engordaria cada requisição e criaria uma cópia que
 * envelhece: o médico trocaria o nome e o token continuaria dizendo o antigo pelos
 * 15 minutos seguintes.
 *
 * Mais detalhes: PLAN.md §8.2 · PRODUCT.md — INV-04, INV-07.
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
      // Token assinado por nós apontando para um médico que não existe mais. Quem
      // deixou de valer é a **sessão**, não um recurso de outra pessoa — por isso
      // 401 ("faça login de novo"), e não 404.
      return left(new UnauthenticatedError(UNAUTHENTICATED_MESSAGE));
    }

    return right({ id: doctor.id, name: doctor.name, email: doctor.email });
  }
}
