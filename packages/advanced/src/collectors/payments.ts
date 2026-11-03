/* eslint-disable @typescript-eslint/no-explicit-any */
import { withTimeout } from '@fingerprint/core';
import type { Collector } from './types';

function applePaySession(): Record<string, unknown> {
  const A = (window as any).ApplePaySession;
  if (!A) return { available: false };
  let maxVersion: number | null = null;
  for (let v = 20; v >= 1; v--) {
    try {
      if (A.supportsVersion(v)) {
        maxVersion = v;
        break;
      }
    } catch {
      /* unsupported */
    }
  }
  let canMakePayments: boolean | null = null;
  try {
    canMakePayments = A.canMakePayments();
  } catch {
    /* insecure context or blocked in iframe */
  }
  return { available: true, maxVersion, canMakePayments };
}

/**
 * Ask a payment handler whether it could pay, without opening any sheet. `canMakePayment` says the
 * method exists; `hasEnrolledInstrument` says a card/wallet is actually set up (Chromium, Safari).
 * Chrome rate-limits repeated queries and then rejects, which we report as `null`.
 */
async function probe(method: string, data?: unknown): Promise<{ supported: boolean; ready: boolean | null } | null> {
  const PR = (window as any).PaymentRequest;
  if (!PR) return null;
  try {
    const req = new PR([{ supportedMethods: method, ...(data ? { data } : {}) }], {
      total: { label: 'probe', amount: { currency: 'USD', value: '0.01' } },
    });
    const supported = await withTimeout<boolean>(req.canMakePayment(), 1500);
    let ready: boolean | null = null;
    if (supported && typeof req.hasEnrolledInstrument === 'function') {
      ready = await withTimeout<boolean>(req.hasEnrolledInstrument(), 1500).catch(() => null);
    }
    return { supported, ready };
  } catch {
    return { supported: false, ready: null };
  }
}

/**
 * Wallets this device can pay with. Reveals the ecosystem the user lives in (Apple Pay = Apple ID
 * with a card, Google Pay = signed-in Chrome, Samsung Pay = Galaxy) and is hard to fake.
 */
export const payments: Collector = {
  id: 'payments',
  stable: false, // depends on what cards the user has added
  bits: 3,
  timeoutMs: 4000,
  async run() {
    const w = window as any;
    if (!w.PaymentRequest && !w.ApplePaySession) return { supported: false };
    const [apple, google, samsung, basicCard] = await Promise.all([
      probe('https://apple.com/apple-pay', { version: 3, merchantIdentifier: 'merchant.invalid', countryCode: 'US', currencyCode: 'USD', supportedNetworks: ['visa', 'masterCard'], merchantCapabilities: ['supports3DS'] }),
      probe('https://google.com/pay', {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{ type: 'CARD', parameters: { allowedAuthMethods: ['PAN_ONLY'], allowedCardNetworks: ['VISA'] } }],
      }),
      probe('https://spay.samsung.com'),
      probe('basic-card'),
    ]);
    const session = applePaySession();
    const wallets = [
      (session.available || apple?.supported) && 'Apple Pay',
      google?.supported && 'Google Pay',
      samsung?.supported && 'Samsung Pay',
    ].filter(Boolean) as string[];
    return {
      supported: true,
      paymentRequest: !!w.PaymentRequest,
      applePay: { ...session, paymentRequest: apple },
      googlePay: google,
      samsungPay: samsung,
      basicCard,
      wallets,
    };
  },
};
