import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionPterodactyl, checkPterodactyl } from '../lib/pterodactyl-provision.ts';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

const baseInput = {
  baseUrl: 'https://panel.example.com',
  applicationKey: 'ptla_application',
  clientKey: 'ptlc_client',
  nestId: 5,
  eggId: 16,
  locationId: 1,
};

test('preflight checks application, client, egg and location', async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/api/application/users')) return jsonResponse({ object: 'list', data: [] });
    if (String(url).includes('/api/client/account')) return jsonResponse({ attributes: { username: 'owner' } });
    if (String(url).includes('/eggs/16')) return jsonResponse({ attributes: { id: 16, relationships: { variables: { data: [] } } } });
    if (String(url).includes('/locations/1')) return jsonResponse({ attributes: { id: 1 } });
    throw new Error(`unexpected ${url}`);
  };
  const result = await checkPterodactyl(baseInput, fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.application.ok, true);
  assert.equal(result.client.ok, true);
  assert.equal(result.egg.ok, true);
  assert.equal(result.location.ok, true);
  assert.equal(urls.length, 4);
});

test('preflight exposes actionable 403 details without exposing key', async () => {
  const fakeFetch = async () => jsonResponse({ errors: [{ detail: 'This action is unauthorized.' }] }, 403);
  const result = await checkPterodactyl(baseInput, fakeFetch);
  assert.equal(result.ok, false);
  assert.match(result.application.message, /HTTP 403: This action is unauthorized/i);
  assert.doesNotMatch(JSON.stringify(result), /ptla_application/);
});

test('provision uses egg defaults and ASEP BOT identity', async () => {
  const requests = [];
  const fakeFetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes('/eggs/16')) return jsonResponse({ attributes: { relationships: { variables: { data: [
      { attributes: { env_variable: 'STARTUP_CMD', default_value: 'npm start' } },
      { attributes: { env_variable: 'BOT_JS_FILE', default_value: 'index.js' } },
    ] } } } });
    if (String(url).endsWith('/api/application/users') && init.method === 'POST') return jsonResponse({ attributes: { id: 42 } }, 201);
    if (String(url).endsWith('/api/application/servers') && init.method === 'POST') return jsonResponse({ attributes: { identifier: 'abc123' } }, 201);
    throw new Error(`unexpected ${url}`);
  };
  const result = await provisionPterodactyl({
    ...baseInput,
    fetchImpl: fakeFetch,
    username: 'member01',
    password: 'StrongPass123!',
    email: 'member01@asepbot.local',
    serverName: 'ASEP BOT - member01',
    dockerImage: 'ghcr.io/parkervcp/yolks:nodejs_22',
    startup: 'npm start',
    limits: { memory: 1024, swap: 0, disk: 2048, io: 500, cpu: 50 },
    featureLimits: { databases: 1, allocations: 1, backups: 1 },
  });
  assert.equal(result.identifier, 'abc123');
  const userBody = JSON.parse(requests.find((r) => r.url.endsWith('/api/application/users')).init.body);
  assert.equal(userBody.first_name, 'ASEP');
  assert.equal(userBody.last_name, 'BOT');
  const serverBody = JSON.parse(requests.find((r) => r.url.endsWith('/api/application/servers')).init.body);
  assert.deepEqual(serverBody.environment, { STARTUP_CMD: 'npm start', BOT_JS_FILE: 'index.js' });
});

test('provision deletes temporary user if server creation fails', async () => {
  const requests = [];
  const fakeFetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes('/eggs/16')) return jsonResponse({ attributes: { relationships: { variables: { data: [] } } } });
    if (String(url).endsWith('/api/application/users') && init.method === 'POST') return jsonResponse({ attributes: { id: 77 } }, 201);
    if (String(url).endsWith('/api/application/servers')) return jsonResponse({ errors: [{ detail: 'No allocations satisfying the requirements for automatic deployment were found.' }] }, 422);
    if (String(url).endsWith('/api/application/users/77') && init.method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`unexpected ${url}`);
  };
  await assert.rejects(() => provisionPterodactyl({
    ...baseInput,
    fetchImpl: fakeFetch,
    username: 'member02', password: 'StrongPass123!', email: 'member02@asepbot.local', serverName: 'ASEP BOT - member02',
    dockerImage: 'image', startup: 'npm start',
    limits: { memory: 1024, swap: 0, disk: 2048, io: 500, cpu: 50 },
    featureLimits: { databases: 1, allocations: 1, backups: 1 },
  }), /\[CREATE_SERVER\].*HTTP 422.*User sementara berhasil dibersihkan/i);
  assert.ok(requests.some((r) => r.url.endsWith('/api/application/users/77') && r.init.method === 'DELETE'));
});

test('provision reports create-user 403 with stage name', async () => {
  const fakeFetch = async (url, init = {}) => {
    if (String(url).includes('/eggs/16')) return jsonResponse({ attributes: { relationships: { variables: { data: [] } } } });
    if (String(url).endsWith('/api/application/users') && init.method === 'POST') return jsonResponse({ errors: [{ detail: 'This action is unauthorized.' }] }, 403);
    throw new Error(`unexpected ${url}`);
  };
  await assert.rejects(() => provisionPterodactyl({
    ...baseInput,
    fetchImpl: fakeFetch,
    username: 'member03', password: 'StrongPass123!', email: 'member03@asepbot.local', serverName: 'ASEP BOT - member03',
    dockerImage: 'image', startup: 'npm start',
    limits: { memory: 1024, swap: 0, disk: 2048, io: 500, cpu: 50 },
    featureLimits: { databases: 1, allocations: 1, backups: 1 },
  }), /\[CREATE_USER\] HTTP 403: This action is unauthorized/i);
});
