import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TaskApi, validateConfig } from "../api.js";

// Uses only the public configuration; touches only the task created by this run.
const site = process.argv[2];
let config;
if (site) {
  const url = new URL(site.endsWith("/") ? site : `${site}/`);
  const response = await fetch(new URL("config.json", url), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Cannot load deployed configuration: HTTP ${response.status}`);
  config = await response.json();
} else config = JSON.parse(await readFile(new URL("../config.json", import.meta.url), "utf8"));

const api = new TaskApi(validateConfig(config));
let id;
try {
  await api.list(); console.log("PASS: public GET tasks");
  const created = await api.create({ title: `Verification ${crypto.randomUUID()}`, description: "Temporary automated assignment check" });
  id = created.id;
  assert.equal(created.completed, false); console.log("PASS: public POST task");
  const fresh = await new TaskApi(config).get(id);
  assert.equal(fresh.title, created.title); console.log("PASS: GET by ID using a new API client");
  const edited = await api.update(id, { title: `${created.title} edited`, description: "Updated description" });
  assert.equal(edited.description, "Updated description");
  assert.equal((await api.get(id)).title, edited.title); console.log("PASS: edit and read back persisted changes");
  await api.update(id, { completed: true });
  assert.equal((await api.get(id)).completed, true); console.log("PASS: mark completed");
  await api.update(id, { completed: false });
  assert.equal((await api.get(id)).completed, false); console.log("PASS: mark incomplete");
  await api.remove(id);
  assert.equal((await api.request("GET", { id: `eq.${id}`, select: "*" })).tasks.length, 0);
  id = undefined; console.log("PASS: delete and verify absence");
} finally {
  if (id) {
    try { await api.remove(id); console.log("Temporary verification task removed."); }
    catch { console.error("Could not clean up the temporary verification task. Check the demonstration task list."); }
  }
}
