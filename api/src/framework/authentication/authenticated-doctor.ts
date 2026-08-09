/**
 * O que o guard escreve no request e o decorator lê de volta.
 *
 * Existe como tipo declarado, e não como acordo tácito entre dois arquivos, porque
 * é exatamente esse acordo que se perde: o dia em que o guard gravar `doctorId` em
 * vez de `id`, o decorator devolve `undefined` e a API passa a escopar tudo por
 * nada — sem erro de compilação e sem teste vermelho, se o tipo não existir.
 */
export interface AuthenticatedDoctor {
  id: string;
  email: string;
}

/**
 * A superfície do request que a autenticação usa — nada mais.
 *
 * Espelha o `HttpResponse` do `AllExceptionsFilter`: `framework/` descreve o que
 * precisa do transporte em vez de importar o tipo do Express. Trocar o adaptador
 * HTTP não deveria alcançar o guard.
 */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  doctor?: AuthenticatedDoctor;
}

/**
 * O texto único do 401 de identidade. É o mesmo que o `AllExceptionsFilter` usa
 * para 401 por status: sem isto, a API responderia o mesmo erro com dois textos
 * diferentes, conforme quem o lançou.
 */
export const UNAUTHENTICATED_MESSAGE = 'Autenticação necessária.';
