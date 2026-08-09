import { Test } from '@nestjs/testing';

import { REFRESH_TOKENS_REPOSITORY } from '@/shared/constants/repositories';
import {
  AccessTokenPayload,
  IssuedAccessToken,
  TokenIssuer,
} from '@/shared/interfaces/cryptography/token-issuer';

import { RefreshToken } from '../../model-entities/refresh-token.entity';
import {
  CreateRefreshTokenData,
  RefreshTokenRepository,
} from '../../repositories/refresh-token.repository';
import { RevokeSessionService } from './revoke-session.service';

const REFRESH_IN_PLAIN = 'refresh-token-em-claro';

class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly items: CreateRefreshTokenData[] = [];
  /** Cada revogação registrada, inclusive as repetidas — é o que prova a idempotência. */
  readonly revokeCalls: string[] = [];
  readonly revokedHashes: string[] = [];

  async create(data: CreateRefreshTokenData): Promise<void> {
    this.items.push(data);
  }

  async findValidByHash(hash: string): Promise<RefreshToken | null> {
    const stored = this.items.find(
      (item) => item.tokenHash === hash && !this.revokedHashes.includes(hash),
    );

    return stored ? Object.assign(new RefreshToken(), { ...stored, revokedAt: null }) : null;
  }

  async revokeByHash(hash: string): Promise<void> {
    this.revokeCalls.push(hash);

    if (!this.revokedHashes.includes(hash)) {
      this.revokedHashes.push(hash);
    }
  }
}

class FakeTokenIssuer implements TokenIssuer {
  async issueAccessToken(): Promise<IssuedAccessToken> {
    return { token: 'access-token', expiresInSeconds: 900 };
  }

  generateRefreshToken(): string {
    return REFRESH_IN_PLAIN;
  }

  hashRefreshToken(token: string): string {
    return Buffer.from(token).toString('hex');
  }

  async verifyAccessToken(): Promise<AccessTokenPayload | null> {
    return null;
  }
}

describe('RevokeSessionService', () => {
  let service: RevokeSessionService;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let tokenIssuer: FakeTokenIssuer;

  beforeEach(async () => {
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    tokenIssuer = new FakeTokenIssuer();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RevokeSessionService,
        { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokenRepository },
        { provide: TokenIssuer, useValue: tokenIssuer },
      ],
    }).compile();

    service = moduleRef.get(RevokeSessionService);

    await refreshTokenRepository.create({
      doctorId: '11111111-1111-1111-1111-111111111111',
      tokenHash: tokenIssuer.hashRefreshToken(REFRESH_IN_PLAIN),
      expiresAt: new Date('2026-08-08T20:00:00.000Z'),
    });
  });

  it('revoga a sessão pelo hash, nunca pelo valor cru (INV-06)', async () => {
    await service.execute({ refreshToken: REFRESH_IN_PLAIN });

    expect(refreshTokenRepository.revokeCalls).toEqual([
      tokenIssuer.hashRefreshToken(REFRESH_IN_PLAIN),
    ]);
    expect(refreshTokenRepository.revokeCalls[0]).not.toContain(REFRESH_IN_PLAIN);
    expect(await refreshTokenRepository.findValidByHash(refreshTokenRepository.revokeCalls[0])).toBeNull();
  });

  it('não falha com token desconhecido — logout nunca é erro', async () => {
    await expect(service.execute({ refreshToken: 'token-que-nunca-existiu' })).resolves.toBeUndefined();
  });

  it('é idempotente: duas chamadas com o mesmo token seguem sem erro', async () => {
    await service.execute({ refreshToken: REFRESH_IN_PLAIN });

    await expect(service.execute({ refreshToken: REFRESH_IN_PLAIN })).resolves.toBeUndefined();
    // A porta foi chamada duas vezes; a revogação continua sendo uma só.
    expect(refreshTokenRepository.revokeCalls).toHaveLength(2);
    expect(refreshTokenRepository.revokedHashes).toHaveLength(1);
  });
});
