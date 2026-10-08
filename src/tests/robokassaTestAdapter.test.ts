import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRobokassaTestCheckout, loadRobokassaTestConfig, verifyRobokassaTestResult } from '../server/services/robokassaTestAdapter.ts';

const config = { merchantLogin: 'club-test', password1: 'fixture-one', password2: 'fixture-two', hashAlgorithm: 'sha256' as const };
const expected = { invoiceId: '123', amountKopecks: 10000 };
const callback = (outSum = '100.000000', secret = config.password2) => ({
  OutSum: outSum, InvId: '123', Shp_mode: 'test',
  SignatureValue: crypto.createHash('sha256').update([outSum, '123', secret, 'Shp_mode=test'].join(':')).digest('hex'),
});

describe('Robokassa preparation stays test-only', () => {
  it('requires explicit activation and separate test secrets without live fallback', () => {
    expect(loadRobokassaTestConfig({})).toBeNull();
    expect(() => loadRobokassaTestConfig({ ROBOKASSA_TEST_ENABLED: 'true', ROBOKASSA_MERCHANT_LOGIN: 'club', ROBOKASSA_PASSWORD1: 'live', ROBOKASSA_PASSWORD2: 'live' })).toThrow();
    expect(() => loadRobokassaTestConfig({ ROBOKASSA_TEST_ENABLED: 'true', ROBOKASSA_MERCHANT_LOGIN: 'club', ROBOKASSA_TEST_PASSWORD1: 'one', ROBOKASSA_TEST_PASSWORD2: 'two', ROBOKASSA_HASH_ALGORITHM: 'unknown' })).toThrow();
  });
  it('formats integer kopecks and signs a provider POST request without leaking secrets', () => {
    const checkout = createRobokassaTestCheckout(config, { ...expected, description: 'Тест участия в вечере' });
    expect(checkout.fields).toMatchObject({ OutSum: '100.00', InvId: '123', IsTest: '1', Shp_mode: 'test' });
    expect(checkout.fields.SignatureValue).toBe(crypto.createHash('sha256').update('club-test:100.00:123:fixture-one:Shp_mode=test').digest('hex'));
    expect(JSON.stringify(checkout)).not.toContain(config.password1);
    expect(JSON.stringify(checkout)).not.toContain(config.password2);
    expect(checkout.method).toBe('POST');
  });
  it('rejects invalid amounts and nonnumeric invoice ids', () => {
    for (const amountKopecks of [0, -1, 1.5, NaN, Infinity, 100_000_001]) {
      expect(() => createRobokassaTestCheckout(config, { ...expected, amountKopecks, description: 'Test' })).toThrow();
    }
    expect(() => createRobokassaTestCheckout(config, { ...expected, invoiceId: 'uuid', description: 'Test' })).toThrow();
  });
  it('accepts provider decimal spelling and uppercase signatures', () => {
    const fields = callback();
    expect(verifyRobokassaTestResult(config, { ...fields, SignatureValue: fields.SignatureValue.toUpperCase() }, expected))
      .toEqual({ ...expected, acknowledgement: 'OK123', test: true });
    expect(verifyRobokassaTestResult(config, callback('100.00'), expected)?.acknowledgement).toBe('OK123');
  });
  it('rejects wrong amounts, ids, signatures and SuccessURL password', () => {
    expect(verifyRobokassaTestResult(config, callback('99.00'), expected)).toBeNull();
    expect(verifyRobokassaTestResult(config, callback('100.000001'), expected)).toBeNull();
    expect(verifyRobokassaTestResult(config, callback('100.00', config.password1), expected)).toBeNull();
    for (const fields of [{ ...callback(), InvId: '124' }, { ...callback(), SignatureValue: 'bad' }, { ...callback(), OutSum: ['100.00'] }, { ...callback(), Shp_mode: 'live' }, { ...callback(), Shp_other: 'extra' }]) {
      expect(verifyRobokassaTestResult(config, fields, expected)).toBeNull();
    }
  });
  it('supports explicitly selected MD5 and does not alter accounting on repeat verification', () => {
    const md5 = { ...config, hashAlgorithm: 'md5' as const };
    const fields = { ...callback(), SignatureValue: crypto.createHash('md5').update('100.000000:123:fixture-two:Shp_mode=test').digest('hex') };
    expect(verifyRobokassaTestResult(md5, fields, expected)?.test).toBe(true);
    expect(verifyRobokassaTestResult(md5, fields, expected)).toEqual(verifyRobokassaTestResult(md5, fields, expected));
  });
});
