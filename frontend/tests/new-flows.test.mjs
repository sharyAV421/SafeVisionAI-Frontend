import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server, apiModule, policy, presentation, originalFetch;
before(async () => {
  server = await createServer({ configFile: "vite.config.ts", server: { middlewareMode: true, ws: false }, appType: "custom" });
  apiModule = await server.ssrLoadModule("/src/api.ts");
  policy = await server.ssrLoadModule("/src/passwordPolicy.ts");
  presentation = await server.ssrLoadModule("/src/eventPresentation.ts");
  originalFetch = globalThis.fetch;
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test("registration, recovery and reset send documented bodies with credentials", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (calls.length === 1) return new Response('{}', { status: 201 });
    if (calls.length === 2) return new Response(JSON.stringify({ detail: "Mensaje genérico" }), { status: 202 });
    return new Response(null, { status: 204 });
  };
  const api = new apiModule.SafeVisionApi();
  await api.register("Ana", "ana@example.test", "password1", "test-invitation");
  const recovery = await api.forgotPassword("ana@example.test");
  await api.resetPassword("test-token", "password2");
  assert.equal(recovery.detail, "Mensaje genérico");
  assert.deepEqual(calls.map(call => call.url.pathname), ["/api/auth/register", "/api/auth/password/forgot", "/api/auth/password/reset"]);
  assert.deepEqual(calls.map(call => JSON.parse(call.init.body)), [
    { name: "Ana", email: "ana@example.test", password: "password1", invitation_code: "test-invitation" },
    { email: "ana@example.test" }, { token: "test-token", new_password: "password2" },
  ]);
  for (const call of calls) { assert.equal(call.init.method, "POST"); assert.equal(call.init.credentials, "include"); }
});

test("auth failures preserve expected statuses and validation details", async () => {
  const api = new apiModule.SafeVisionApi();
  for (const status of [400, 403, 409, 422, 429, 503]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: status === 422 ? [{ loc: ["body", "password"], msg: "Invalid password" }] : "failure" }), { status });
    await assert.rejects(api.resetPassword("test-token", "password2"), error => error.status === status && (status !== 422 || error.message === "body.password: Invalid password"));
  }
});

test("password policy requires length, letter and number", () => {
  assert.equal(policy.isValidPassword("abcd1234"), true);
  for (const value of ["abc1234", "abcdefgh", "12345678", ""]) assert.equal(policy.isValidPassword(value), false);
});

test("event evidence requires an HTTPS URL and confidence is optional", () => {
  assert.equal(presentation.eventEvidenceUrl("https://example.test/photo.jpg"), "https://example.test/photo.jpg");
  for (const value of [null, "", "http://example.test/photo.jpg", "javascript:alert(1)", "https://user:pass@example.test/a", "/relative"]) assert.equal(presentation.eventEvidenceUrl(value), null);
  assert.equal(presentation.eventConfidence(0), "0%");
  assert.equal(presentation.eventConfidence(0.876), "88%");
  for (const value of [null, -1, 1.1, NaN]) assert.equal(presentation.eventConfidence(value), null);
});

test("WebSocket event and alert updates preserve and expose new fields", () => {
  const event = { id: 1, type: "risk", detected_class_label: "Persona", confidence: 0.9, evidence_url: "https://example.test/a.jpg" };
  const events = presentation.mergeStreamEvent([{ id: 1, type: "previous", subject: "Subject" }], event);
  assert.equal(events[0].subject, "Subject");
  assert.equal(events[0].detected_class_label, "Persona");
  assert.equal(events[0].confidence, 0.9);
  const alerts = presentation.mergeStreamAlert([{ id_alerta: 4, event: { id: 1, subject: "Subject" } }], { id_alerta: 4, event });
  assert.equal(alerts[0].event.subject, "Subject");
  assert.equal(alerts[0].event.evidence_url, "https://example.test/a.jpg");
  assert.equal(presentation.mergeStreamAlert([], { id_alerta: 4, event }).length, 1);
});
