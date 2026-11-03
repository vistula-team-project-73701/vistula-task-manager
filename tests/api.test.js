import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, TaskApi, validateConfig } from "../api.js";

const config = { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test", tableName: "tasks" };
const task = { id: 1, title: "Learn Git", description: null, completed: false };
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test("configuration rejects secret keys, unexpected tables, and unsafe URLs", () => {
  assert.deepEqual(validateConfig({ ...config, supabaseUrl: `${config.supabaseUrl}/` }), config);
  for (const key of ["sb_secret_example", "eyJ_service_role_example", ""]) assert.throws(() => validateConfig({ ...config, supabasePublishableKey: key }), /publishable/);
  for (const url of ["http://example.supabase.co", "https://user:password@example.supabase.co", "https://example.supabase.co/rest/v1", "https://example.supabase.co/?key=secret"]) assert.throws(() => validateConfig({ ...config, supabaseUrl: url }), /HTTPS/);
  assert.throws(() => validateConfig({ ...config, tableName: "other" }), /tasks/);
  assert.throws(() => validateConfig({}), /project URL/);
});

test("configuration is fetched without caching and invalid JSON is explained", async () => {
  const loaded = await loadConfig("config.json", async (url, options) => { assert.equal(url, "config.json"); assert.equal(options.cache, "no-store"); return response(config); });
  assert.deepEqual(loaded, config);
  await assert.rejects(loadConfig("config.json", async () => new Response("not json")), /valid JSON/);
  await assert.rejects(loadConfig("config.json", async () => response({}, 404)), /HTTP 404/);
});

test("CRUD uses the public apikey header, filtered IDs, and PATCH", async () => {
  const calls = [];
  const api = new TaskApi(config, async (url, options) => { calls.push({ url, ...options }); return response([task], 200, { "content-range": "0-0/1" }); });
  assert.deepEqual(await api.list(), [{ ...task, id: "1", description: "" }]);
  await api.get("1");
  await api.create({ title: task.title });
  await api.update("1", { title: "Edited" });
  await api.update("1", { completed: true });
  await api.remove("1");
  assert.deepEqual(calls.map(call => call.method), ["GET", "GET", "POST", "PATCH", "PATCH", "DELETE"]);
  for (const call of calls) { assert.equal(call.url.pathname, "/rest/v1/tasks"); assert.equal(call.headers.apikey, config.supabasePublishableKey); assert.equal(call.headers.Authorization, undefined); }
  assert.equal(calls[1].url.searchParams.get("id"), "eq.1");
  assert.equal(calls[1].url.searchParams.get("select"), "*");
  assert.deepEqual(JSON.parse(calls[2].body), { title: task.title, description: "", completed: false });
  assert.deepEqual(JSON.parse(calls[3].body), { title: "Edited" });
  assert.deepEqual(JSON.parse(calls[4].body), { completed: true });
  assert.equal(calls[5].headers.Prefer, "return=representation");
});

test("all tasks are fetched even when the server applies a smaller page limit", async () => {
  const offsets = [];
  const api = new TaskApi(config, async url => {
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    return response([{ ...task, id: offset + 1 }], 206, { "content-range": `${offset}-${offset}/3` });
  });
  assert.equal((await api.list()).length, 3);
  assert.deepEqual(offsets, [0, 1, 2]);
});

test("failed operations do not pretend that a task was saved or deleted", async () => {
  const denied = new TaskApi(config, async () => response({ message: "new row violates row-level security policy" }, 403));
  await assert.rejects(denied.create(task), /HTTP 403.*row-level security.*RLS/);
  const missing = new TaskApi(config, async () => response([]));
  await assert.rejects(missing.update("1", { title: "Edited" }), /no longer exists/);
  await assert.rejects(missing.remove("1"), /no longer exists/);
  await assert.rejects(missing.create(task), /did not confirm/);
  await assert.rejects(missing.get("1&other=eq.2"), /Invalid task ID/);
});

test("network, timeout, malformed data, and HTML error responses are explained", async () => {
  await assert.rejects(new TaskApi(config, async () => { throw new TypeError("fetch failed"); }).list(), /Cannot reach/);
  await assert.rejects(new TaskApi(config, async () => { throw new DOMException("timed out", "TimeoutError"); }).list(), /timed out/);
  await assert.rejects(new TaskApi(config, async () => new Response("<html>Server error</html>", { status: 502 })).list(), /unreadable.*502/);
  await assert.rejects(new TaskApi(config, async () => response([{ ...task, completed: "false" }])).list(), /unexpected record/);
  await assert.rejects(new TaskApi(config, async () => response({})).list(), /list of tasks/);
});
