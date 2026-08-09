import { Test } from '@nestjs/testing';

import { DOCTORS_REPOSITORY, REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import { EnvironmentService } from '@/shared/environments/environment.service';
import { InvalidCredentialsError } from '@/shared/errors/types';
import { PasswordHasher } from '@/shared/interfaces/cryptography/password-hasher';
import {
  AccessTokenPayload,
  IssuedAccessToken,
  TokenIssuer,
} from '@/shared/interfaces/cryptography/token-issuer';

import { Doctor } from '../../model-entities/doctor.entity';
import { RefreshToken } from '../../model-entities/refresh-token.entity';
import { DoctorRepository } from '../../repositories/doctor.repository';
import {
  CreateRefreshTokenData,
  RefreshTokenRepository,
} from '../../repositories/refresh-token.repository';
import { AuthenticateDoctorService } from './authenticate-doctor.service';

/**
 * Instante fixo para todo o arquivo. O service calcula `expiresAt` a partir de
 * `Date.now()`, e teste que lê o relógio real é teste que quebra sozinho à
 * meia-noite — ou num fuso diferente do de quem o escreveu.
 */
const FIXED_NOW = new Date('2026-08-07T12:00:00.000Z');

const REFRESH_TTL_HOURS = 8;
const ACCESS_TTL_SECONDS = 900;

class InMemoryDoctorRepository implements DoctorRepository {
  readonly items: Doctor[] = [];

  async findByEmail(email: string): Promise<Doctor | null> {
    return this.items.find((doctor) => doctor.email === email) ?? null;
  }

  async findById(id: string): Promise<Doctor | null> {
    return this.items.find((doctor) => doctor.id === id) ?? null;
  }
}

/**
 * Implementa a porta **inteira**, mesmo que este arquivo só exercite `create`: o
 * duplo satisfaz o mesmo contrato do adapter real, inclusive na parte que ignora
 * revogado e expirado. Duplo que atende metade da porta passa a mentir no dia em
 * que o service crescer.
 */
class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly items: CreateRefreshTokenData[] = [];
  readonly revokedHashes: string[] = [];

  async create(data: CreateRefreshTokenData): Promise<void> {
    this.items.push(data);
  }

  async findValidByHash(hash: string): Promise<RefreshToken | null> {
    const stored = this.items.find(
      (item) =>
        item.tokenHash === hash &&
        item.expiresAt > new Date() &&
        !this.revokedHashes.includes(hash),
    );

    return stored ? Object.assign(new RefreshToken(), { ...stored, revokedAt: null }) : null;
  }

  async revokeByHash(hash: string): Promise<void> {
    if (!this.revokedHashes.includes(hash)) {
      this.revokedHashes.push(hash);
    }
  }
}

/**
 * O ganho concreto da porta de senha: sem este falso, cada caso deste arquivo
 * pagaria ~80 ms de bcrypt real para provar coisa nenhuma sobre bcrypt.
 */
class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

class FakeTokenIssuer implements TokenIssuer {
  readonly issuedPayloads: AccessTokenPayload[] = [];

  async issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken> {
    this.issuedPayloads.push(payload);

    return { token: 'access-token', expiresInSeconds: ACCESS_TTL_SECONDS };
  }

  generateRefreshToken(): string {
    return 'refresh-token-em-claro';
  }

  /**
   * Hex, e não `` `sha256:${token}` ``: o falso precisa ser fiel na propriedade que
   * o teste afirma — a de que o valor cru **não sobrevive** no resultado. Um prefixo
   * concatenado carregaria o token inteiro dentro do "hash" e tornaria a asserção
   * de INV-06 impossível de passar por motivo nenhum do código real.
   *
   * `node:crypto` não entra aqui: este arquivo mora sob `services/**`, onde o lint
   * proíbe cripto concreta. O SHA-256 de verdade é exercitado no e2e.
   */
  hashRefreshToken(token: string): string {
    return Buffer.from(token).toString('hex');
  }

  /** Não exercitado aqui — o login não verifica access token. Existe para o duplo
   *  satisfazer a porta inteira. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    return token === 'access-token' ? { sub: 'doctor-id', email: 'doctor@prontomed.dev' } : null;
  }
}

function makeDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return Object.assign(new Doctor(), {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Dra. Helena Prado',
    email: 'helena@prontomed.dev',
    passwordHash: 'hashed:senha-correta',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  });
}

describe('AuthenticateDoctorService', () => {
  let service: AuthenticateDoctorService;
  let doctorRepository: InMemoryDoctorRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let passwordHasher: FakePasswordHasher;
  let tokenIssuer: FakeTokenIssuer;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);

    doctorRepository = new InMemoryDoctorRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    passwordHasher = new FakePasswordHasher();
    tokenIssuer = new FakeTokenIssuer();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthenticateDoctorService,
        { provide: DOCTORS_REPOSITORY, useValue: doctorRepository },
        { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokenRepository },
        { provide: PasswordHasher, useValue: passwordHasher },
        { provide: TokenIssuer, useValue: tokenIssuer },
        {
          provide: EnvironmentService,
          useValue: { get: () => REFRESH_TTL_HOURS },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthenticateDoctorService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('credencial válida', () => {
    beforeEach(() => {
      doctorRepository.items.push(makeDoctor());
    });

    it('devolve a sessão com os três campos do contrato', async () => {
      const result = await service.execute({
        email: 'helena@prontomed.dev',
        password: 'senha-correta',
      });

      expect(result.isRight()).toBe(true);

      if (!result.isRight()) return;

      expect(result.value).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token-em-claro',
        expiresIn: ACCESS_TTL_SECONDS,
      });
    });

    it('assina o access token com o id do médico em `sub` — é dele que sai o escopo', async () => {
      await service.execute({ email: 'helena@prontomed.dev', password: 'senha-correta' });

      expect(tokenIssuer.issuedPayloads).toEqual([
        { sub: '11111111-1111-1111-1111-111111111111', email: 'helena@prontomed.dev' },
      ]);
    });

    // INV-06 — a asserção que justifica a existência desta invariante.
    it('persiste apenas o SHA-256 do refresh; o valor em claro nunca chega ao repositório', async () => {
      const result = await service.execute({
        email: 'helena@prontomed.dev',
        password: 'senha-correta',
      });

      expect(refreshTokenRepository.items).toHaveLength(1);

      const [persisted] = refreshTokenRepository.items;
      const plainRefreshToken = result.isRight() ? result.value.refreshToken : '';

      expect(persisted.tokenHash).toBe(tokenIssuer.hashRefreshToken(plainRefreshToken));
      expect(persisted.tokenHash).not.toBe(plainRefreshToken);
      // A asserção que importa: o valor cru não aparece em campo nenhum do que foi
      // entregue ao repositório — nem como substring.
      expect(JSON.stringify(persisted)).not.toContain(plainRefreshToken);
    });

    it('grava a expiração do refresh em `agora + REFRESH_TOKEN_TTL_HOURS`', async () => {
      await service.execute({ email: 'helena@prontomed.dev', password: 'senha-correta' });

      const [persisted] = refreshTokenRepository.items;

      expect(persisted.expiresAt).toEqual(
        new Date(FIXED_NOW.getTime() + REFRESH_TTL_HOURS * 60 * 60 * 1000),
      );
      expect(persisted.doctorId).toBe('11111111-1111-1111-1111-111111111111');
    });
  });

  describe('credencial inválida', () => {
    it('recusa senha errada sem dizer que a senha é o problema', async () => {
      doctorRepository.items.push(makeDoctor());

      const result = await service.execute({
        email: 'helena@prontomed.dev',
        password: 'senha-errada',
      });

      expect(result.isLeft()).toBe(true);

      if (!result.isLeft()) return;

      expect(result.value).toBeInstanceOf(InvalidCredentialsError);
      expect(result.value.code).toBe('INVALID_CREDENTIALS');
      expect(result.value.message).toBe('Email ou senha incorretos.');
    });

    it('responde a email inexistente exatamente como a senha errada', async () => {
      doctorRepository.items.push(makeDoctor());

      const [comSenhaErrada, comEmailInexistente] = await Promise.all([
        service.execute({ email: 'helena@prontomed.dev', password: 'senha-errada' }),
        service.execute({ email: 'ninguem@prontomed.dev', password: 'senha-correta' }),
      ]);

      expect(comEmailInexistente.isLeft()).toBe(true);
      expect(comSenhaErrada.isLeft()).toBe(true);

      if (!comEmailInexistente.isLeft() || !comSenhaErrada.isLeft()) return;

      expect(comEmailInexistente.value.code).toBe(comSenhaErrada.value.code);
      expect(comEmailInexistente.value.message).toBe(comSenhaErrada.value.message);
    });

    // Decisão 14: a mensagem igual fecha a porta; o custo igual fecha a janela.
    it('paga o custo do hash mesmo quando o email não existe — anti-enumeração por cronômetro', async () => {
      const compare = jest.spyOn(passwordHasher, 'compare');

      await service.execute({ email: 'ninguem@prontomed.dev', password: 'qualquer' });

      expect(compare).toHaveBeenCalledTimes(1);
      // Contra um hash descartável, jamais contra string vazia: `compare` com hash
      // malformado retorna cedo e a defesa de tempo se perde.
      expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('não abre sessão nenhuma quando a credencial falha', async () => {
      await service.execute({ email: 'ninguem@prontomed.dev', password: 'qualquer' });

      expect(refreshTokenRepository.items).toHaveLength(0);
      expect(tokenIssuer.issuedPayloads).toHaveLength(0);
    });
  });
});
