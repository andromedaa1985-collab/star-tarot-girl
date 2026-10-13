import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaziRequestSnapshot, filterBaziProfiles, getBaziBirthFingerprint, getBaziResultStatus, isBaziRequestCurrent, restoreBaziEditor, saveBaziProfile } from '../src/lib/baziProfiles';

const a = { id: 'a', name: '体验甲', gender: 'female' as const, birthDate: '1995-04-12', birthTime: '09:30', birthLocation: '上海', currentLocation: '北京' };
const b = { ...a, id: 'b', name: '体验乙', birthTime: '11:00', currentLocation: '广州' };

test('explicit new mode always appends, including the same name and birth date', () => {
  const saved = saveBaziProfile([a], { ...a }, null, 'new');
  assert.equal(saved.created, true);
  assert.deepEqual(saved.profiles.map(profile => profile.id), ['a', 'new']);
  assert.deepEqual(saved.profiles[0], a);
});

test('editing changes only the selected ID and rejects a missing editing target', () => {
  const saved = saveBaziProfile([a, b], { ...a, name: '新称呼' }, 'a', 'unused');
  assert.equal(saved.changed, true);
  assert.equal(saved.profile.id, 'a');
  assert.equal(saved.profiles[1], b);
  assert.throws(() => saveBaziProfile([a], { ...b }, 'missing', 'new'), /已不存在/);
});

test('archive search combines name, date and locations without changing source data', () => {
  assert.deepEqual(filterBaziProfiles([a, b], '体验 1995 广州'), [b]);
  assert.deepEqual(filterBaziProfiles([a, b], '上海 北京'), [a]);
  assert.deepEqual(filterBaziProfiles([a, b], '  '), [a, b]);
  assert.deepEqual(filterBaziProfiles([a, b], '杭州'), []);
});

test('results require ownership and retain legacy records as unverified', () => {
  const result = { profileId: a.id, profileSnapshot: a, birthFingerprint: getBaziBirthFingerprint(a) };
  assert.equal(getBaziResultStatus(result, a, a), 'current');
  assert.equal(getBaziResultStatus(result, b, b), 'other-profile');
  assert.equal(getBaziResultStatus({}, a), 'legacy');
  assert.equal(getBaziResultStatus({ ...result, profileSnapshot: { name: a.name } as typeof a }, a), 'legacy');
  assert.equal(getBaziResultStatus(null, a), 'empty');
});

test('saved or unsaved birth/location edits invalidate the old interpretation', () => {
  const result = { profileId: a.id, profileSnapshot: a, birthFingerprint: getBaziBirthFingerprint(a) };
  assert.equal(getBaziResultStatus(result, { ...a, birthTime: '10:30' }), 'changed');
  assert.equal(getBaziResultStatus(result, a, { ...a, birthDate: '1995-04-13' }), 'changed');
  assert.equal(getBaziResultStatus(result, { ...a, currentLocation: '广州' }), 'changed');
});

test('an in-flight result cannot write after switching or editing, even switching back', async () => {
  let current = a;
  let revision = 1;
  const snapshot = createBaziRequestSnapshot(current, revision);
  const response = Promise.resolve('old result');
  current = b;
  revision += 1;
  await response;
  assert.equal(isBaziRequestCurrent(snapshot, current, revision), false);
  current = a;
  revision += 1;
  assert.equal(isBaziRequestCurrent(snapshot, current, revision), false);
  assert.equal(isBaziRequestCurrent(createBaziRequestSnapshot(a, revision), { ...a, name: '变更' }, revision), false);
  assert.equal(isBaziRequestCurrent(createBaziRequestSnapshot(a, revision), a, revision), true);
});

test('external active selection hydrates its own profile before saving, never the previous form', () => {
  const restored = restoreBaziEditor([a, b], b.id, a, { profileId: a.id, activeProfileId: a.id });
  assert.equal(restored.reason, 'active-changed');
  assert.equal(restored.editor.profileId, b.id);
  assert.equal(restored.form.name, b.name);
  const saved = saveBaziProfile([a, b], restored.form, restored.editor.profileId, 'unused');
  assert.deepEqual(saved.profiles, [a, b]);
});

test('the same profile preserves its unsaved draft across remounts', () => {
  const draft = { ...a, name: '还没保存的称呼', birthTime: '10:20' };
  const restored = restoreBaziEditor([a, b], a.id, draft, { profileId: a.id, activeProfileId: a.id });
  assert.equal(restored.reason, 'owned-draft');
  assert.equal(restored.form, draft);
  assert.equal(restored.editor.profileId, a.id);
});

test('explicit new mode retains its draft even with an unchanged active profile', () => {
  const draft = { ...a, name: '第三人' };
  const restored = restoreBaziEditor([a, b], a.id, draft, { profileId: null, activeProfileId: a.id });
  assert.equal(restored.editor.profileId, null);
  assert.equal(restored.form, draft);
  assert.equal(saveBaziProfile([a, b], restored.form, restored.editor.profileId, 'c').profiles.length, 3);
});

test('legacy mismatched inputs are preserved as an unconfirmed new draft and cannot overwrite active B', () => {
  const restored = restoreBaziEditor([a, b], b.id, a);
  assert.equal(restored.reason, 'unconfirmed-draft');
  assert.equal(restored.editor.profileId, null);
  assert.equal(restored.form, a);
  const saved = saveBaziProfile([a, b], restored.form, restored.editor.profileId, 'c');
  assert.equal(saved.profiles[1], b);
  assert.equal(saved.created, true);
  assert.equal(restoreBaziEditor([a, b], b.id, b).reason, 'legacy-matched');
});
