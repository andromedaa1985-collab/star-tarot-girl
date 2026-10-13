import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldSubmitOnEnter } from '../src/lib/composerKeyboard';

test('Enter used to select a Chinese IME candidate does not submit the question', () => {
  assert.equal(shouldSubmitOnEnter({ key: 'Enter', isComposing: true, keyCode: 13 }), false);
  assert.equal(shouldSubmitOnEnter({ key: 'Enter', isComposing: false, keyCode: 229 }), false);
});

test('Enter submits a finished question while ordinary typing does not', () => {
  assert.equal(shouldSubmitOnEnter({ key: 'Enter', isComposing: false, keyCode: 13 }), true);
  assert.equal(shouldSubmitOnEnter({ key: 'a', isComposing: false, keyCode: 65 }), false);
});
