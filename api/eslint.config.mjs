// A arquitetura como regra. PLAN.md Apêndice C — a fronteira que o review [Backend]
// checa manualmente tem que ser a mesma que o lint reprova sozinho.
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const FORBIDDEN_IN_SERVICES = [
  {
    group: [
      'typeorm',
      '@nestjs/typeorm',
      'express',
      'pg',
      'bcryptjs',
      '@nestjs/jwt',
      'jsonwebtoken',
      'crypto',
      'node:crypto',
    ],
    message:
      'Caso de uso não depende de ORM, transporte nem cripto concreta — use a porta (ADR-02, PLAN §8.4).',
  },
  {
    group: ['**/infrastructure/**', '**/gateways/**'],
    message: 'A dependência aponta para dentro: o service não conhece infra nem transporte.',
  },
];

const FORBIDDEN_IN_CONTROLLERS = [
  {
    group: ['typeorm', '**/infrastructure/**'],
    message: 'Controller fala com service, nunca com repositório ou ORM.',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  ...tseslint.configs.recommended,
  prettier,

  {
    // Alinha o lint ao que o `tsc` já aceita: prefixo `_` marca intencionalmente
    // não-usado, e a propriedade omitida num destructuring com rest não é lixo.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    // `model-entities/**` fica de fora de propósito: a entity é a do ORM (ADR-03).
    files: ['src/domains/domain/services/**/*.ts'],
    // `*.provider.ts` e `*.module.ts` também: eles são o **composition root** do
    // módulo — amarrar porta a adapter exige, por definição, conhecer os dois lados.
    // A regra existe para proteger o caso de uso, e o caso de uso é o `*.service.ts`.
    // Preço: lógica de negócio escondida num provider não é pega pelo lint; quem
    // pega é o review [Backend].
    ignores: ['src/domains/domain/services/**/*.provider.ts', 'src/domains/domain/services/**/*.module.ts'],
    rules: {
      // A regra base ignora `import type { Repository } from 'typeorm'`; a do plugin, não.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: FORBIDDEN_IN_SERVICES },
      ],
    },
  },

  {
    files: ['src/gateways/http/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: FORBIDDEN_IN_CONTROLLERS },
      ],
    },
  },
);
