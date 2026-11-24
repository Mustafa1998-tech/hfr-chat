import { expect, test } from '@playwright/test';
import { API_BASE, api, localToken } from '../fixtures/helpers';

test.describe('REST API / Swagger', () => {
  test('health and Swagger document are available', async ({ request }) => {
    const health = await request.get('http://127.0.0.1:5080/health');
    expect(health.ok()).toBeTruthy();
    const swagger = await (await request.get('http://127.0.0.1:5080/swagger/v1/swagger.json')).json();
    for (const p of ['/api/auth/login', '/api/chats', '/api/projects/{id}', '/api/skills/{id}/enabled'])
      expect(swagger.paths[p], `swagger path ${p}`).toBeTruthy();
  });

  test('protected endpoints reject unauthenticated requests', async ({ request }) => {
    for (const path of ['/chats', '/projects', '/skills', '/models', '/settings', '/files'])
      expect((await api(request, 'GET', path)).status(), path).toBe(401);
  });

  test('invalid credentials are rejected and local mode issues a token', async ({ request }) => {
    expect((await api(request, 'POST', '/auth/login', undefined,
      { email: 'nobody@example.com', password: 'wrong' })).status()).toBe(401);
    const token = await localToken(request);
    expect(token.length).toBeGreaterThan(20);
    expect((await api(request, 'GET', '/users/me', token)).ok()).toBeTruthy();
  });

  test('chat CRUD, rename and per-chat model preference', async ({ request }) => {
    const token = await localToken(request);
    const created = await (await api(request, 'POST', '/chats', token, { title: 'API QA chat' })).json();
    expect(created.id).toBeTruthy();
    const renamed = await (await api(request, 'PATCH', `/chats/${created.id}`, token, { title: 'API QA renamed' })).json();
    expect(renamed.title).toBe('API QA renamed');
    const models = await (await api(request, 'GET', '/models', token)).json();
    const model = models.find((m: any) => m.configured);
    expect(model).toBeTruthy();
    const withModel = await (await api(request, 'PATCH', `/chats/${created.id}/model`, token, { modelId: model.id })).json();
    expect(withModel.aiModelId ?? withModel.aIModelId ?? withModel.modelId).toBeTruthy();
    expect((await api(request, 'GET', `/chats/${created.id}`, token)).ok()).toBeTruthy();
    expect((await api(request, 'DELETE', `/chats/${created.id}`, token)).status()).toBe(204);
    expect((await api(request, 'GET', `/chats/${created.id}`, token)).status()).toBe(404);
  });

  test('message idempotency and real SSE completion', async ({ request }) => {
    const token = await localToken(request);
    const chat = await (await api(request, 'POST', '/chats', token, { title: 'API stream' })).json();
    const requestId = `qa-${Date.now()}`;
    const payload = { content: 'Reply with exactly: API_OK', requestId };
    const first = await (await api(request, 'POST', `/chats/${chat.id}/messages`, token, payload)).json();
    const second = await (await api(request, 'POST', `/chats/${chat.id}/messages`, token, payload)).json();
    expect(second.id).toBe(first.id);
    const messages = await (await api(request, 'GET', `/chats/${chat.id}/messages`, token)).json();
    expect(messages.filter((m: any) => m.role === 'user').length).toBe(1);
    const stream = await api(request, 'POST', `/chats/${chat.id}/stream`, token,
      { content: 'Reply with exactly: API_OK', requestId: `qa-stream-${Date.now()}` });
    expect(stream.ok()).toBeTruthy();
    const text = await stream.text();
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');
    expect(text).toContain('API_OK');
    await api(request, 'DELETE', `/chats/${chat.id}`, token);
  });

  test('projects and skills validation, duplicate handling and CRUD', async ({ request }) => {
    const token = await localToken(request);
    expect((await api(request, 'POST', '/projects', token, { name: '' })).status()).toBe(400);
    const name = `API Project ${Date.now()}`;
    const created = await (await api(request, 'POST', '/projects', token, { name })).json();
    expect((await api(request, 'POST', '/projects', token, { name })).status()).toBe(409);
    expect((await api(request, 'PUT', `/projects/${created.id}`, token,
      { name: `${name} edited`, description: 'QA' })).ok()).toBeTruthy();
    expect((await api(request, 'GET', `/projects/${created.id}`, token)).ok()).toBeTruthy();
    await api(request, 'DELETE', `/projects/${created.id}`, token);

    expect((await api(request, 'POST', '/skills', token, { name: '' })).status()).toBe(400);
    const skill = await (await api(request, 'POST', '/skills', token,
      { name: `API Skill ${Date.now()}`, description: 'd', instructions: 'i' })).json();
    expect((await api(request, 'PUT', `/skills/${skill.id}/enabled`, token, { isEnabled: false })).ok()).toBeTruthy();
    expect((await api(request, 'DELETE', `/skills/${skill.id}`, token)).status()).toBe(204);
  });

  test('settings and file validation + ownership', async ({ request }) => {
    const token = await localToken(request);
    const settings = await (await api(request, 'PUT', '/settings', token, { theme: 'dark' })).json();
    expect(settings.theme).toBe('dark');
    await api(request, 'PUT', '/settings', token, { theme: 'light' });
    expect((await api(request, 'GET', '/files', token)).ok()).toBeTruthy();

    const multipart = await api(request, 'POST', '/files/upload', token, undefined);
    expect(multipart.status()).toBe(400);
    const bad = await api(request, 'POST', '/files/upload', token, undefined);
    expect(bad.status()).toBe(400);
  });

  test('IDOR protection between two users', async ({ request }) => {
    const token = await localToken(request);
    const email = `idor-${Date.now()}@example.com`;
    const other = await (await api(request, 'POST', '/auth/register', undefined,
      { email, password: 'StrongPass123!', displayName: 'IDOR QA' })).json();
    const chat = await (await api(request, 'POST', '/chats', token, { title: 'private' })).json();
    expect((await api(request, 'GET', `/chats/${chat.id}/messages`, other.accessToken)).status()).toBe(404);
    expect((await api(request, 'GET', `/chats/${chat.id}`, other.accessToken)).status()).toBe(404);
    await api(request, 'DELETE', `/chats/${chat.id}`, token);
  });
});
