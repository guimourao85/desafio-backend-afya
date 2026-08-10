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
 * Uma senha falsa, já embaralhada, contra a qual se compara quando o email **não
 * existe**. Parece código morto e não é — é uma defesa contra um ataque de relógio.
 *
 * Sem ela, o caminho "email inexistente" responde em ~1 ms (não há hash para
 * conferir) e o caminho "senha errada" em ~80 ms (o hash é caro de propósito). A
 * diferença é visível com um cronômetro, e quem a mede descobre **quais emails têm
 * conta** sem acertar uma única senha. Num prontuário, a lista de médicos
 * cadastrados já é informação que não deveria vazar.
 *
 * A mensagem idêntica fecha a porta; isto aqui fecha a janela.
 *
 * Manutenção: o custo está gravado dentro do próprio valor (`$2a$10$`) e precisa
 * acompanhar a configuração `BCRYPT_ROUNDS`. Se o ambiente subir para 12, este
 * literal tem de ser regerado — senão a diferença de tempo volta, menor, mas volta.
 */
const DUMMY_PASSWORD_HASH = '$2a$10$WZQoOF6zi5q8EVoWhs.eau2A.K3JLL2F4sMajbtU/P53pgsPo3Hju';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * Autentica o médico e abre a sessão.
 *
 * O que sai daqui: um access token curto (15 minutos, é o que vai no header das
 * outras rotas) e um refresh longo (8 horas, serve só para pedir um access novo).
 *
 * Credencial inválida é devolvida como **resultado**, não lançada como exceção:
 * senha errada é um desfecho esperado do login, não um defeito do sistema. Quem
 * chama fica obrigado pelo tipo a tratar o caso, em vez de descobrir na produção.
 *
 * As duas defesas contra enumeração de contas vivem neste arquivo: mensagem única
 * (logo acima) e custo de tempo constante (logo abaixo).
 *
 * Mais detalhes: PLAN.md §8.2 · PRODUCT.md — INV-06, §regras.
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

    // A conferência de senha roda **sempre**, exista o médico ou não. Parece
    // trabalho jogado fora quando o email não existe, e é justamente o ponto: é o
    // que faz os dois caminhos de falha demorarem o mesmo tanto.
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
      // O que vai para o banco é a versão embaralhada. O refresh em texto puro só
      // existe na resposta HTTP e nunca toca uma coluna — se o banco vazar, os
      // tokens gravados nele não servem para entrar. (INV-06)
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
