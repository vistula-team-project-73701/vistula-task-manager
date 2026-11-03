// Browser code uses only the public publishable key; RLS controls database access.
export function validateConfig(config) {
  if (!config || typeof config.supabaseUrl !== "string" || !config.supabaseUrl.trim()) {
    throw new Error("Add your Supabase project URL and public publishable key to config.json, then click Refresh.");
  }
  let url;
  try { url = new URL(config.supabaseUrl.trim()); } catch { throw new Error("config.json contains an invalid Supabase project URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^\/?$/.test(url.pathname)) {
    throw new Error("Use the HTTPS Supabase project URL in config.json, without a path, password, or query string.");
  }
  if (typeof config.supabasePublishableKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey)) {
    throw new Error("config.json needs a public sb_publishable_ key. Never use a secret or service role key.");
  }
  if (config.tableName !== "tasks") throw new Error('The tableName in config.json must be exactly "tasks".');
  return { supabaseUrl: url.origin, supabasePublishableKey: config.supabasePublishableKey, tableName: "tasks" };
}

export async function loadConfig(url = "config.json", fetcher = fetch) {
  const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Cannot load config.json (HTTP ${response.status}).`);
  let config;
  try { config = await response.json(); } catch { throw new Error("config.json must contain valid JSON."); }
  return validateConfig(config);
}

function normaliseTask(task) {
  const validId = (typeof task?.id === "number" && Number.isSafeInteger(task.id) && task.id > 0)
    || (typeof task?.id === "string" && /^[1-9]\d*$/.test(task.id));
  if (!validId || typeof task.title !== "string" || typeof task.completed !== "boolean"
      || (task.description !== null && task.description !== undefined && typeof task.description !== "string")) {
    throw new Error("The tasks table returned an unexpected record. Check its id, title, description, and completed columns.");
  }
  return { ...task, id: String(task.id), description: task.description ?? "" };
}

export class TaskApi {
  constructor(config, fetcher = fetch) {
    this.config = validateConfig(config);
    // Native browser fetch must be called without the TaskApi instance as `this`.
    this.fetcher = (url, options) => fetcher(url, options);
  }

  async request(method, query = {}, body) {
    const url = new URL(`${this.config.supabaseUrl}/rest/v1/tasks`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const headers = { apikey: this.config.supabasePublishableKey, Accept: "application/json", Prefer: method === "GET" ? "count=exact" : "return=representation" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try { response = await this.fetcher(url, { method, headers, cache: "no-store", signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch (error) {
      if (["TimeoutError", "AbortError"].includes(error.name)) throw new Error("The database request timed out. Check your connection and try again.");
      throw new Error("Cannot reach the database. Check your connection and Supabase project URL, then try again.");
    }
    let data;
    try { data = await response.json(); } catch { throw new Error(`The database returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) {
      const detail = typeof data?.message === "string" ? ` ${data.message}` : "";
      const help = [401, 403].includes(response.status) ? " Check the public key, table grants, and RLS policies." : response.status === 404 ? " Check that the tasks table exists and the Data API is enabled." : "";
      throw new Error(`Database operation failed (HTTP ${response.status}).${detail}${help}`);
    }
    if (!Array.isArray(data)) throw new Error("The database response should be a list of tasks.");
    const totalText = response.headers.get("content-range")?.split("/")[1];
    return { tasks: data.map(normaliseTask), total: totalText && totalText !== "*" ? Number(totalText) : null };
  }

  async list() {
    const tasks = [];
    while (true) {
      const page = await this.request("GET", { select: "*", order: "id.desc", limit: 1000, offset: tasks.length });
      tasks.push(...page.tasks);
      if (page.tasks.length === 0 || (page.total !== null ? tasks.length >= page.total : page.tasks.length < 1000)) return tasks;
    }
  }
  async get(id) { return this.single("GET", id); }
  async create(task) {
    const result = await this.request("POST", {}, { title: task.title, description: task.description || "", completed: false });
    if (result.tasks.length !== 1) throw new Error("The database did not confirm the new task. Refresh the list before trying again.");
    return result.tasks[0];
  }
  async update(id, changes) { return this.single("PATCH", id, changes); }
  async remove(id) { return this.single("DELETE", id); }
  async single(method, id, changes) {
    if (!/^[1-9]\d*$/.test(String(id))) throw new Error("Invalid task ID.");
    const result = await this.request(method, { id: `eq.${id}`, ...(method === "GET" ? { select: "*" } : {}) }, changes);
    if (result.tasks.length !== 1) throw new Error("This task no longer exists or access was denied. Refresh the task list.");
    return result.tasks[0];
  }
}
