import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlanPeriodLabel, getProfilePurchaseAuthPath } from '../src/lib/purchaseFlow';

test('login return keeps the selected product and free trial intent separately', () => {
  for (const trial of [false, true]) {
    const auth = new URL(getProfilePurchaseAuthPath('couple_plus_monthly', trial), 'https://example.test');
    const next = new URL(auth.searchParams.get('next')!, auth.origin);
    assert.equal(auth.pathname, '/auth');
    assert.equal(next.pathname, '/app/profile');
    assert.equal(next.searchParams.get('plan'), 'couple_plus_monthly');
    assert.equal(next.searchParams.get('plus'), '1');
    assert.equal(next.searchParams.get('trial'), trial ? '1' : null);
  }
});

test('visible duration follows the entitlement instead of a hardcoded month label', () => {
  assert.equal(getPlanPeriodLabel({ entitlement: { type: 'membership', days: 31 } }), '31 天权益');
  assert.equal(getPlanPeriodLabel({ entitlement: { type: 'membership', days: 14 } }), '14 天权益');
  assert.equal(getPlanPeriodLabel({ entitlement: { type: 'bundle' } }), '一次性购买');
});
