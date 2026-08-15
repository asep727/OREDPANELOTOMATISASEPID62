import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePanelKeys,
  classifyPanelKey,
  readApiError,
  extractEggEnvironment,
  validatePanelBaseUrl,
} from '../lib/pterodactyl-utils.ts';

test('classifies Pterodactyl API key prefixes', () => {
  assert.equal(classifyPanelKey('ptla_abc'), 'application');
  assert.equal(classifyPanelKey('ptlc_abc'), 'client');
  assert.equal(classifyPanelKey('random'), 'unknown');
  assert.equal(classifyPanelKey(''), 'empty');
});

test('automatically swaps clearly reversed PTLA and PTLC values', () => {
  assert.deepEqual(normalizePanelKeys('ptlc_client', 'ptla_application'), {
    applicationKey: 'ptla_application',
    clientKey: 'ptlc_client',
    swapped: true,
  });
});

test('keeps correctly mapped panel keys unchanged', () => {
  assert.deepEqual(normalizePanelKeys('ptla_application', 'ptlc_client'), {
    applicationKey: 'ptla_application',
    clientKey: 'ptlc_client',
    swapped: false,
  });
});

test('rejects a client key placed alone in the application field', () => {
  assert.throws(() => normalizePanelKeys('ptlc_client', ''), /Application API Key harus memakai prefix ptla_/i);
});

test('rejects an application key placed alone in the client field', () => {
  assert.throws(() => normalizePanelKeys('', 'ptla_application'), /Client API Token harus memakai prefix ptlc_/i);
});

test('validates and normalizes panel base URL', () => {
  assert.equal(validatePanelBaseUrl('https://panel.example.com/'), 'https://panel.example.com');
  assert.throws(() => validatePanelBaseUrl('http://panel.example.com'), /HTTPS/i);
  assert.throws(() => validatePanelBaseUrl('not-a-url'), /URL panel/i);
});

test('reads Pterodactyl JSON errors without leaking request credentials', async () => {
  const response = new Response(JSON.stringify({ errors: [{ detail: 'This action is unauthorized.' }] }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(await readApiError(response, 'Gagal'), 'HTTP 403: This action is unauthorized.');
});

test('falls back to plain text API errors', async () => {
  const response = new Response('Forbidden by proxy', { status: 403 });
  assert.equal(await readApiError(response, 'Gagal'), 'HTTP 403: Forbidden by proxy');
});

test('extracts egg default environment from relationship variables', () => {
  const egg = {
    attributes: {
      relationships: {
        variables: {
          data: [
            { attributes: { env_variable: 'STARTUP_CMD', default_value: 'npm start' } },
            { attributes: { env_variable: 'NODE_ENV', default_value: 'production' } },
          ],
        },
      },
    },
  };
  assert.deepEqual(extractEggEnvironment(egg), { STARTUP_CMD: 'npm start', NODE_ENV: 'production' });
});

test('extracts egg environment from top-level variables array', () => {
  const egg = { attributes: { variables: [{ env_variable: 'BOT_JS_FILE', default_value: 'index.js' }] } };
  assert.deepEqual(extractEggEnvironment(egg), { BOT_JS_FILE: 'index.js' });
});
