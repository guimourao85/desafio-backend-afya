import { Inject, Injectable } from '@nestjs/common';

import { DOCTORS_REPOSITORY, REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import { EnvironmentService } from '@/shared/environments/environment.service';
import { Either, left, right } from '@/shared/errors/either';
import { InvalidCredentialsError } from '@/shared/errors/types';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';
import { TokenIssuer } from '@/shared/interfaces/cryptography/token-issuer';

import { DoctorRepository } from '../../repositories/doctor.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';

export interface AuthenticateDoctorRequest {
  /** Já normalizado pela borda (`trim` + `toLowerCase`) — o schema Zod cuida disso. */
  email: string;
  password: string;
}

export interface AuthenticateDoctorResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type AuthenticateDoctorResult = Either<
  InvalidCredentialsError,
  AuthenticateDoctorResponse
>;

/**
 * Mensagem única para email inexistente **e** senha errada. Distinguir os dois
 * transforma o login num oráculo de "esta pessoa tem conta aqui" — o que, num
 * prontuário, já é vazamento de dado sensível antes de qualquer senha ser quebrada.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Email ou senha incorretos.';

/**
 * Hash bcrypt descartável, de custo 10, contra o qual se compara quando o email não
 * existe. Não é paranoia: sem ele o caminho "email inexistente" retorna em ~1 ms e o
 * caminho "senha errada" em ~80 ms — e um cronômetro enumera a base de médicos sem
 * acertar uma senha sequer. A mensagem idêntica fecha a porta; isto fecha a janela.
 *
 * O custo gravado aqui (`$2a$10$`) tem de acompanhar `BCRYPT_ROUNDS`: se o ambiente
 * subir para 12, este literal precisa ser regerado, ou a diferença de tempo volta —
 * menor, mas volta.
 */
const DUMMY_PASSWORD_HASH = '$2a$10$WZQoOF6zi5q8EVoWhs.eau2A.K3JLL2F4sMajbtU/P53pgsPo3Hju';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * Autentica o médico e abre a sessão (PLAN.md §8.2).
 *
 * Devolve `Either` em vez de lançar: credencial inválida é resultado **esperado** do
 * login, não defeito. Quem chama fica obrigado pelo tipo a tratar o caso.
 */
@Injectable()
export class AuthenticateDoctorService {
  constructor(
    @Inject(DOCTORS_REPOSITORY)
    private readonly doctorRepository: DoctorRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenIssuer: TokenIssuer,
    private readonly environment: EnvironmentService,
  ) {}

  async execute({ email, password }: AuthenticateDoctorRequest): Promise<AuthenticateDoctorResult> {
    const doctor = await this.doctorRepository.findByEmail(email);

    // O bcrypt roda **sempre**, exista o médico ou não. É o que iguala o tempo dos
    // dois caminhos de falha.
    const passwordMatches = await this.passwordHasher.compare(
      password,
      doctor?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!doctor || !passwordMatches) {
      return left(new InvalidCredentialsError(INVALID_CREDENTIALS_MESSAGE));
    }

    const { token: accessToken, expiresInSeconds } = await this.tokenIssuer.issueAccessToken({
      sub: doctor.id,
      email: doctor.email,
    });

    const refreshToken = this.tokenIssuer.generateRefreshToken();

    await this.refreshTokenRepository.create({
      doctorId: doctor.id,
      // O que vai para o banco é o hash. O valor cru não passa daqui para baixo (INV-06).
      tokenHash: this.tokenIssuer.hashRefreshToken(refreshToken),
      expiresAt: this.refreshTokenExpiresAt(),
    });

    return right({ accessToken, refreshToken, expiresIn: expiresInSeconds });
  }

  /**
   * A validade do refresh nasce aqui, não no `DEFAULT` da coluna: por quanto tempo
   * uma sessão vale é regra de sessão. No schema, ela ficaria invisível para quem lê
   * o caso de uso.
   */
  private refreshTokenExpiresAt(): Date {
    const hours = this.environment.get('REFRESH_TOKEN_TTL_HOURS');

    return new Date(Date.now() + hours * MILLISECONDS_PER_HOUR);
  }
}
