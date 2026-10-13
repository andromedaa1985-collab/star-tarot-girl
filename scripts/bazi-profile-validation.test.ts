import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCalendarDate, validateBaziProfile } from '../src/lib/baziProfileValidation';

const today = '2026-10-13';
const fixture = {
  name: '体验档案', gender: 'female', birthDate: '2000-02-29', birthTime: '12:30',
  birthLocation: '上海', currentLocation: '北京',
};

test('profile validation trims fields before deciding whether an archive can be saved', () => {
  const result = validateBaziProfile({
    ...fixture, name: '  体验档案  ', birthLocation: ' 上海 ', currentLocation: ' 北京 ',
  }, today);
  assert.equal(result.isValid, true);
  assert.deepEqual(result.value, fixture);
  for (const field of ['name', 'birthLocation', 'currentLocation'] as const) {
    const blank = validateBaziProfile({ ...fixture, [field]: ' \t\n　' }, today);
    assert.equal(blank.isValid, false, field);
    assert.ok(blank.errors[field], field);
  }
});

test('calendar validation rejects overflow dates and accepts correct leap-year dates', () => {
  for (const date of ['2025-02-29', '1900-02-29', '2026-04-31', '2026-00-12', '2026-12-00', '0000-01-01', '2026-13-01']) {
    assert.equal(isCalendarDate(date), false, date);
    assert.ok(validateBaziProfile({ ...fixture, birthDate: date }, today).errors.birthDate, date);
  }
  assert.equal(isCalendarDate('2000-02-29'), true);
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2026-02-28'), true);
});

test('birthday accepts today but refuses tomorrow and a future year', () => {
  assert.equal(validateBaziProfile({ ...fixture, birthDate: today }, today).isValid, true);
  for (const birthDate of ['2026-10-14', '2099-01-01']) {
    const result = validateBaziProfile({ ...fixture, birthDate }, today);
    assert.equal(result.isValid, false);
    assert.equal(result.errors.birthDate, '出生日期不能晚于今天。');
  }
});

test('malformed dates and invalid clock values receive specific field errors', () => {
  for (const birthDate of ['2000/02/29', '2000-2-29', 'not-a-date']) {
    assert.ok(validateBaziProfile({ ...fixture, birthDate }, today).errors.birthDate, birthDate);
  }
  for (const birthTime of ['24:00', '12:60', '7:30', 'noon']) {
    assert.ok(validateBaziProfile({ ...fixture, birthTime }, today).errors.birthTime, birthTime);
  }
  assert.equal(validateBaziProfile({ ...fixture, birthTime: '00:00' }, today).isValid, true);
  assert.equal(validateBaziProfile({ ...fixture, birthTime: '23:59' }, today).isValid, true);
});

test('missing fields give actionable reasons instead of creating an empty archive', () => {
  const result = validateBaziProfile({}, today);
  assert.equal(result.isValid, false);
  assert.deepEqual(Object.keys(result.errors), ['name', 'birthDate', 'birthTime', 'birthLocation', 'currentLocation']);
  assert.match(result.message || '', /姓名或称呼/);
});
