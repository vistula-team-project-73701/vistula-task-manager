import { test, expect } from "@playwright/test";

const config = { supabaseUrl: "https://test-project.supabase.co", supabasePublishableKey: "sb_publishable_test", tableName: "tasks" };

async function mockDatabase(page, initial = []) {
  let tasks = structuredClone(initial);
  let nextId = Math.max(0, ...tasks.map(task => task.id)) + 1;
  const calls = [];
  let failNextWrite = false;
  // Serve at the same subdirectory as GitHub Pages to catch absolute-path bugs.
  await page.route("http://127.0.0.1:4173/vistula-task-manager/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/vistula-task-manager/", "/");
    if (path === "/config.json") return route.fulfill({ json: config });
    const original = await route.fetch({ url: `${url.origin}${path || "/"}` });
    await route.fulfill({ response: original });
  });
  await page.route("https://test-project.supabase.co/rest/v1/tasks**", async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    calls.push({ method, url: request.url(), headers: request.headers() });
    const headers = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
    if (method !== "GET" && failNextWrite) { failNextWrite = false; return route.fulfill({ status: 403, headers, json: { message: "RLS policy rejected this change" } }); }
    const id = Number(url.searchParams.get("id")?.replace("eq.", ""));
    let rows;
    if (method === "GET") {
      rows = id ? tasks.filter(task => task.id === id) : [...tasks].sort((a, b) => b.id - a.id);
      headers["content-range"] = rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
    } else if (method === "POST") {
      const task = { id: nextId++, ...request.postDataJSON() }; tasks.push(task); rows = [task];
    } else if (method === "PATCH") {
      tasks = tasks.map(task => task.id === id ? { ...task, ...request.postDataJSON() } : task);
      rows = tasks.filter(task => task.id === id);
    } else if (method === "DELETE") { rows = tasks.filter(task => task.id === id); tasks = tasks.filter(task => task.id !== id); }
    else return route.fulfill({ status: 405, headers, json: { message: "Unexpected method" } });
    await route.fulfill({ status: method === "POST" ? 201 : 200, headers, json: rows });
  });
  return { calls, failNextWrite: () => { failNextWrite = true; }, tasks: () => structuredClone(tasks) };
}

test("create, reload, edit, complete, reopen, and delete a persistent task", async ({ page }) => {
  const database = await mockDatabase(page);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#refresh-tasks")).toBeEnabled();
  await expect(page.locator("#status-message")).toContainText("You’re connected");
  await expect(page.locator("#task-submit")).toBeEnabled();
  await expect(page.locator("#contribution-link")).toHaveAttribute("href", "contribution.html");
  await page.locator("#task-title").fill("Learn Git");
  await page.locator("#task-description").fill("Practice pull requests");
  await page.locator("#task-submit").click();
  const task = page.locator('.task-item[data-id="1"]');
  await expect(task.locator(".task-title")).toHaveText("Learn Git");
  await expect(task.locator(".task-description")).toHaveText("Practice pull requests");
  await expect(task.locator(".task-status")).toHaveText("Incomplete");
  await page.reload();
  await expect(task.locator(".task-title")).toHaveText("Learn Git");
  await task.locator(".edit-task").click();
  await expect(page.locator("#task-title")).toHaveValue("Learn Git");
  await page.locator("#task-title").fill("Learn GitHub");
  await page.locator("#task-description").fill("Review and merge a pull request");
  await page.locator("#task-submit").click();
  await expect(task.locator(".task-title")).toHaveText("Learn GitHub");
  await task.locator(".toggle-task").click();
  await expect(task.locator(".task-status")).toHaveText("Completed");
  await page.reload();
  await expect(task.locator(".task-status")).toHaveText("Completed");
  await expect(task.locator(".task-description")).toHaveText("Review and merge a pull request");
  await task.locator(".toggle-task").click();
  await expect(task.locator(".task-status")).toHaveText("Incomplete");
  await task.locator(".delete-task").click();
  await expect(page.locator(".task-item")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#task-submit")).toBeEnabled();
  await expect(page.locator(".task-item")).toHaveCount(0);
  expect(database.tasks()).toEqual([]);
  expect(database.calls.some(call => new URL(call.url).searchParams.get("id") === "eq.1" && call.method === "GET")).toBeTruthy();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("failed save keeps form input, reports the error, and permits retry", async ({ page }) => {
  const database = await mockDatabase(page);
  await page.goto("./");
  await expect(page.locator("#task-submit")).toBeEnabled();
  await page.locator("#task-title").fill("Keep this title");
  database.failNextWrite();
  await page.locator("#task-submit").click();
  await expect(page.locator("#status-message")).toContainText("HTTP 403");
  await expect(page.locator("#task-title")).toHaveValue("Keep this title");
  await expect(page.locator(".task-item")).toHaveCount(0);
  await page.locator("#task-submit").click();
  await expect(page.locator(".task-title")).toHaveText("Keep this title");
});

test("task content is displayed as text and filtering and edit cancellation work", async ({ page }) => {
  await mockDatabase(page, [
    { id: 1, title: '<img src=x onerror="window.injected=true">', description: "<script>bad()</script>", completed: false },
    { id: 2, title: "Finished task", description: null, completed: true }
  ]);
  await page.goto("./");
  await expect(page.locator(".task-item")).toHaveCount(2);
  await expect(page.locator('.task-item[data-id="1"] .task-title')).toContainText("<img");
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.locator('[data-filter="completed"]').click();
  await expect(page.locator(".task-title")).toHaveText("Finished task");
  await page.locator('[data-filter="all"]').click();
  await page.locator('.task-item[data-id="2"] .edit-task').click();
  await expect(page.locator("#cancel-edit")).toBeVisible();
  await page.locator("#task-title").fill("Unsaved title");
  await page.locator("#cancel-edit").click();
  await expect(page.locator('.task-item[data-id="2"] .task-title')).toHaveText("Finished task");
  await expect(page.locator("#task-title")).toHaveValue("");
});

test("missing configuration shows a useful message and enables Refresh", async ({ page }) => {
  await mockDatabase(page);
  await page.route("**/config.json", route => route.fulfill({ json: { ...config, supabaseUrl: "" } }));
  await page.goto("./");
  await expect(page.locator("#status-message")).toContainText("config.json");
  await expect(page.locator("#task-submit")).toBeDisabled();
  await expect(page.locator("#refresh-tasks")).toBeEnabled();
});

test("whitespace titles are rejected without sending a write", async ({ page }) => {
  const database = await mockDatabase(page);
  await page.goto("./");
  await expect(page.locator("#task-submit")).toBeEnabled();
  await page.locator("#task-title").fill("   ");
  await page.locator("#task-submit").click();
  expect(await page.locator("#task-title").evaluate(input => input.validity.valid)).toBeFalsy();
  expect(database.calls.filter(call => call.method === "POST")).toHaveLength(0);
});
