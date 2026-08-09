import { Test } from '@nestjs/testing';

import { DOCTORS_REPOSITORY, REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import { InvalidRefreshTokenError, UnauthenticatedError } from '@/shared/errors/types';
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
import { RefreshSessionService } from './refresh-session.service';

const FIXED_NOW = new Date('2026-08-08T12:00:00.000Z');
const ACCESS_TTL_SECONDS = 900;

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';
const REFRESH_IN_PLAIN = 'refresh-token-em-claro';

class InMemoryDoctorRepository implements DoctorRepository {
  readonly items: Doctor[] = [];

  async findByEmail(email: string): Promise<Doctor | null> {
    return this.items.find((doctor) => doctor.email === email) ?? null;
  }

  async findById(id: string): Promise<Doctor | null> {
    return this.items.find((doctor) => doctor.id === id) ?? null;
  }
}

class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly items: CreateRefreshTokenData[] = [];
  readonly revokedHashes: string[] = [];
  /** O que a porta recebeu, para provar que foi o hash e não o valor cru. */
  readonly queriedHashes: string[] = [];

  async create(data: CreateRefreshTokenData): Promise<void> {
    this.items.push(data);
  }

  async findValidByHash(hash: string): Promise<RefreshToken | null> {
    this.queriedHashes.push(hash);

    const stored = this.items.find(
      (item) =>
        item.tokenHash === hash &&
        item.expiresAt > FIXED_NOW &&
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

class FakeTokenIssuer implements TokenIssuer {
  readonly issuedPayloads: AccessTokenPayload[] = [];
  private issued = 0;

  async issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken> {
    this.issuedPayloads.push(payload);
    this.issued += 1;

    return { token: `access-token-${this.issued}`, expiresInSeconds: ACCESS_TTL_SECONDS };
  }

  generateRefreshToken(): string {
    return REFRESH_IN_PLAIN;
  }

  /** Hex: fiel na propriedade sob teste — o valor cru não sobrevive no resultado. */
  hashRefreshToken(token: string): string {
    return Buffer.from(token).toString('hex');
  }

  async verifyAccessToken(): Promise<AccessTokenPayload | null> {
    return null;
  }
}

function makeDoctor(): Doctor {
  return Object.assign(new Doctor(), {
    id: DOCTOR_ID,
    name: 'Dra. Helena Prado',
    email: 'helena@prontomed.dev',
    passwordHash: 'hashed:senha-correta',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  });
}

describe('RefreshSessionService', () => {
  let service: RefreshSessionService;
  let doctorRepository: InMemoryDoctorRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let tokenIssuer: FakeTokenIssuer;

  beforeEach(async () => {
    doctorRepository = new InMemoryDoctorRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    tokenIssuer = new FakeTokenIssuer();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RefreshSessionService,
        { provide: DOCTORS_REPOSITORY, useValue: doctorRepository },
        { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokenRepository },
        { provide: TokenIssuer, useValue: tokenIssuer },
      ],
    }).compile();

    service = moduleRef.get(RefreshSessionService);

    doctorRepository.items.push(makeDoctor());
    await refreshTokenRepository.create({
      doctorId: DOCTOR_ID,
      tokenHash: tokenIssuer.hashRefreshToken(REFRESH_IN_PLAIN),
      expiresAt: new Date('2026-08-08T20:00:00.000Z'),
    });
  });

  it('devolve um novo access token com o médico dono da sessão no payload', async () => {
    const result = await service.execute({ refreshToken: REFRESH_IN_PLAIN });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({ accessToken: 'access-token-1', expiresIn: ACCESS_TTL_SECONDS });
    expect(tokenIssuer.issuedPayloads).toEqual([
      { sub: DOCTOR_ID, email: 'helena@prontomed.dev' },
    ]);
  });

  it('consulta a porta pelo hash — o valor cru não chega ao banco (INV-06)', async () => {
    await service.execute({ refreshToken: REFRESH_IN_PLAIN });

    expect(refreshTokenRepository.queriedHashes).toEqual([
      tokenIssuer.hashRefreshToken(REFRESH_IN_PLAIN),
    ]);
    expect(refreshTokenRepository.queriedHashes[0]).not.toContain(REFRESH_IN_PLAIN);
  });

  it('não rotaciona: duas renovações seguidas com o mesmo refresh devolvem dois access válidos', async () => {
    const primeira = await service.execute({ refreshToken: REFRESH_IN_PLAIN });
    const segunda = await service.execute({ refreshToken: REFRESH_IN_PLAIN });

    expect(primeira.isRight()).toBe(true);
    expect(segunda.isRight()).toBe(true);
    // Nenhuma sessão nova gravada, nenhuma revogada: o refresh não muda de estado.
    expect(refreshTokenRepository.items).toHaveLength(1);
    expect(refreshTokenRepository.revokedHashes).toHaveLength(0);
  });

  it('recusa refresh desconhecido', async () => {
    const result = await service.execute({ refreshToken: 'token-que-nunca-existiu' });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('recusa refresh revogado com a mesma resposta do desconhecido', async () => {
    await refreshTokenRepository.revokeByHash(tokenIssuer.hashRefreshToken(REFRESH_IN_PLAIN));

    const revogado = await service.execute({ refreshToken: REFRESH_IN_PLAIN });
    const inexistente = await service.execute({ refreshToken: 'token-que-nunca-existiu' });

    expect(revogado.isLeft()).toBe(true);
    // Byte a byte: distinguir os dois casos daria um oráculo de "este token existiu".
    expect((revogado.value as InvalidRefreshTokenError).code).toBe(
      (inexistente.value as InvalidRefreshTokenError).code,
    );
    expect((revogado.value as InvalidRefreshTokenError).message).toBe(
      (inexistente.value as InvalidRefreshTokenError).message,
    );
  });

  it('recusa sessão válida cujo médico não existe mais — 401, não 404', async () => {
    doctorRepository.items.length = 0;

    const result = await service.execute({ refreshToken: REFRESH_IN_PLAIN });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(UnauthenticatedError);
  });
});
