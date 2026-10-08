import crypto from 'node:crypto';

export type RobokassaTestConfig = {
  merchantLogin: string;
  password1: string;
  password2: string;
  hashAlgorithm: 'sha256' | 'md5';
};

const fail = (): never => { throw new Error('Некорректные параметры тестовой оплаты'); };
const validateConfig = (config: RobokassaTestConfig) => {
  if (!config.merchantLogin || !config.password1 || !config.password2 ||
      !['sha256', 'md5'].includes(config.hashAlgorithm) ||
      [config.merchantLogin, config.password1, config.password2].some((v) => v.includes(':'))) fail();
};
const hash = (config: RobokassaTestConfig, value: string) =>
  crypto.createHash(config.hashAlgorithm).update(value, 'utf8').digest('hex');
const validateInvoiceId = (value: string) => {
  if (!/^[1-9][0-9]{0,14}$/.test(value) || !Number.isSafeInteger(Number(value))) fail();
};

/** Configuration is server-only. Missing test credentials never fall back to live credentials. */
export function loadRobokassaTestConfig(env: NodeJS.ProcessEnv = process.env): RobokassaTestConfig | null {
  if (env.ROBOKASSA_TEST_ENABLED !== 'true') return null;
  const config: RobokassaTestConfig = {
    merchantLogin: env.ROBOKASSA_MERCHANT_LOGIN || '',
    password1: env.ROBOKASSA_TEST_PASSWORD1 || '',
    password2: env.ROBOKASSA_TEST_PASSWORD2 || '',
    hashAlgorithm: env.ROBOKASSA_HASH_ALGORITHM === 'md5' ? 'md5' : 'sha256',
  };
  if (env.ROBOKASSA_HASH_ALGORITHM && !['md5', 'sha256'].includes(env.ROBOKASSA_HASH_ALGORITHM)) fail();
  validateConfig(config);
  return config;
}

/** Pure test adapter: caller must persist the invoice before exposing these POST fields.
 * No live payments, receipt claims, accounting mutations or buyer-supplied amount.
 */
export function createRobokassaTestCheckout(config: RobokassaTestConfig, input: {
  invoiceId: string; amountKopecks: number; description: string;
}) {
  validateConfig(config);
  validateInvoiceId(input.invoiceId);
  if (!Number.isSafeInteger(input.amountKopecks) || input.amountKopecks <= 0 || input.amountKopecks > 100_000_000) fail();
  if (!input.description.trim() || input.description.length > 100) fail();
  const outSum = (input.amountKopecks / 100).toFixed(2);
  const fields = {
    MerchantLogin: config.merchantLogin,
    OutSum: outSum,
    InvId: input.invoiceId,
    Description: input.description,
    Culture: 'ru',
    IsTest: '1',
    Shp_mode: 'test',
    SignatureValue: hash(config, [config.merchantLogin, outSum, input.invoiceId, config.password1, 'Shp_mode=test'].join(':')),
  };
  return { action: 'https://auth.robokassa.ru/Merchant/Index.aspx', method: 'POST' as const, fields };
}

/** ResultURL only; never use this for SuccessURL redirects.
 * HTTP layer must pass one decoded string per field and reject duplicate parameters.
 * Keep the provider's exact decimal spelling in the signature (e.g. 100.000000).
 */
export function verifyRobokassaTestResult(config: RobokassaTestConfig,
  fields: Record<string, unknown>, expected: { invoiceId: string; amountKopecks: number },
): { invoiceId: string; amountKopecks: number; acknowledgement: string; test: true } | null {
  validateConfig(config);
  validateInvoiceId(expected.invoiceId);
  if (!Number.isSafeInteger(expected.amountKopecks) || expected.amountKopecks <= 0) return null;
  const { OutSum, InvId, SignatureValue, Shp_mode } = fields;
  if (typeof OutSum !== 'string' || typeof InvId !== 'string' ||
      typeof SignatureValue !== 'string' || Shp_mode !== 'test' || InvId !== expected.invoiceId) return null;
  // Extra Shp fields would alter the signed contract: reject rather than silently ignore.
  if (Object.keys(fields).some((key) => /^shp_/i.test(key) && key !== 'Shp_mode')) return null;
  if (!/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/.test(OutSum)) return null;
  const [whole, fraction = ''] = OutSum.split('.');
  const padded = fraction.padEnd(6, '0');
  if (padded.slice(2) !== '0000') return null;
  const kopecks = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (kopecks !== expected.amountKopecks) return null;
  const signature = hash(config, [OutSum, InvId, config.password2, 'Shp_mode=test'].join(':'));
  if (!new RegExp('^[a-fA-F0-9]{' + signature.length + '}$').test(SignatureValue)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(SignatureValue, 'hex'))) return null;
  return { invoiceId: InvId, amountKopecks: kopecks, acknowledgement: 'OK' + InvId, test: true };
}
