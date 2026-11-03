import { loadConfig, TaskApi } from "./api.js";

const form = document.getElementById("task-form");
const titleInput = document.getElementById("task-title");
const descriptionInput = document.getElementById("task-description");
const submitButton = document.getElementById("task-submit");
const cancelButton = document.getElementById("cancel-edit");
const refreshButton = document.getElementById("refresh-tasks");
const list = document.getElementById("task-list");
const template = document.getElementById("task-template");
const message = document.getElementById("status-message");
const filters = [...document.querySelectorAll("[data-filter]")];
const state = { api: null, tasks: [], editingId: null, filter: "all", busy: false, connected: false };

function showMessage(text, kind = "success") { message.textContent = text; message.dataset.kind = kind; }
function updateControls() {
  for (const control of form.elements) control.disabled = state.busy || !state.connected;
  refreshButton.disabled = state.busy;
  for (const button of list.querySelectorAll("button")) button.disabled = state.busy || !state.connected;
  list.setAttribute("aria-busy", String(state.busy));
  form.setAttribute("aria-busy", String(state.busy));
}
async function runOperation(action) {
  if (state.busy) return;
  state.busy = true;
  updateControls();
  try { await action(); } catch (error) { showMessage(error.message || "Something went wrong. Please try again.", "error"); }
  finally { state.busy = false; updateControls(); }
}
function renderEmpty(heading, detail) {
  const item = document.createElement("li"); item.className = "empty-state";
  const icon = document.createElement("span"); icon.className = "empty-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "✓";
  const title = document.createElement("h3"); title.textContent = heading;
  const description = document.createElement("p"); description.textContent = detail;
  item.append(icon, title, description); list.replaceChildren(item);
}
function render() {
  const completed = state.tasks.filter(task => task.completed).length;
  document.getElementById("total-count").textContent = String(state.tasks.length);
  document.getElementById("active-count").textContent = String(state.tasks.length - completed);
  document.getElementById("completed-count").textContent = String(completed);
  for (const button of filters) button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
  const tasks = state.tasks.filter(task => state.filter === "all" || (state.filter === "completed" ? task.completed : !task.completed));
  list.replaceChildren();
  for (const task of tasks) {
    const item = template.content.firstElementChild.cloneNode(true);
    item.dataset.id = task.id;
    item.classList.toggle("is-completed", task.completed); item.classList.toggle("is-editing", task.id === state.editingId);
    item.querySelector(".task-title").textContent = task.title;
    const description = item.querySelector(".task-description");
    description.textContent = task.description || "No description added."; description.classList.toggle("is-empty", !task.description);
    item.querySelector(".task-status").textContent = task.completed ? "Completed" : "Incomplete";
    item.querySelector(".task-reference").textContent = `#${task.id}`;
    item.querySelector(".toggle-task").textContent = task.completed ? "↶ Mark incomplete" : "✓ Mark complete";
    for (const [selector, label] of [[".edit-task", "Edit"], [".delete-task", "Delete"]]) item.querySelector(selector).setAttribute("aria-label", `${label} task: ${task.title}`);
    list.append(item);
  }
  if (!tasks.length) renderEmpty(state.filter === "all" ? "A fresh start" : "No tasks in this view", state.filter === "all" ? "Add your first task using the form." : "Choose another filter or add a task.");
  document.getElementById("list-summary").textContent = `${tasks.length} of ${state.tasks.length} ${state.tasks.length === 1 ? "task" : "tasks"} shown · Saved in the shared database`;
  updateControls();
}
function resetForm() {
  state.editingId = null; form.reset(); titleInput.setCustomValidity("");
  document.getElementById("form-heading").textContent = "Add a task";
  submitButton.textContent = "Add task +"; cancelButton.hidden = true;
}
function replaceTask(task) { state.tasks = state.tasks.map(existing => existing.id === task.id ? task : existing); }
async function connect() {
  await runOperation(async () => {
    showMessage("Loading tasks from the shared database…", "info");
    try {
      const api = new TaskApi(await loadConfig());
      const tasks = await api.list();
      state.api = api; state.tasks = tasks; state.connected = true;
      if (state.editingId && !tasks.some(task => task.id === state.editingId)) resetForm();
      render(); showMessage("You’re connected. Changes are saved to the shared database.");
    } catch (error) {
      if (!state.connected) renderEmpty("Your tasks will appear here", "Connect your database, then click Refresh to try again.");
      throw error;
    }
  });
}
titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
form.addEventListener("submit", event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) { titleInput.setCustomValidity("Enter a task title containing more than spaces."); titleInput.reportValidity(); return; }
  if (!state.connected) return;
  const values = { title, description: descriptionInput.value.trim() };
  const editingId = state.editingId;
  runOperation(async () => {
    showMessage(editingId ? "Saving changes…" : "Adding your task…", "info");
    if (editingId) replaceTask(await state.api.update(editingId, values));
    else { state.tasks.unshift(await state.api.create(values)); state.filter = "all"; }
    resetForm(); render(); showMessage(editingId ? "Task updated and saved." : "Task added and saved.");
  }).then(() => { if (!state.editingId) titleInput.focus(); });
});
cancelButton.addEventListener("click", () => { resetForm(); render(); showMessage("Editing cancelled. Your saved task is unchanged.", "info"); titleInput.focus(); });
refreshButton.addEventListener("click", connect);
for (const button of filters) button.addEventListener("click", () => { state.filter = button.dataset.filter; render(); });
list.addEventListener("click", event => {
  const button = event.target.closest("button"); const item = button?.closest(".task-item");
  if (!item || state.busy || !state.connected) return;
  const task = state.tasks.find(task => task.id === item.dataset.id);
  if (!task) return;
  runOperation(async () => {
    if (button.classList.contains("edit-task")) {
      const freshTask = await state.api.get(task.id); replaceTask(freshTask); state.editingId = task.id;
      titleInput.value = freshTask.title; descriptionInput.value = freshTask.description; titleInput.setCustomValidity("");
      document.getElementById("form-heading").textContent = "Edit task"; submitButton.textContent = "Save changes"; cancelButton.hidden = false;
      render(); showMessage(`Editing “${freshTask.title}”. Save when you’re ready.`, "info");
    } else if (button.classList.contains("toggle-task")) {
      const updated = await state.api.update(task.id, { completed: !task.completed }); replaceTask(updated); render();
      showMessage(updated.completed ? "Task marked as completed and saved." : "Task marked as incomplete and saved.");
    } else if (button.classList.contains("delete-task")) {
      await state.api.remove(task.id); state.tasks = state.tasks.filter(existing => existing.id !== task.id);
      if (state.editingId === task.id) resetForm();
      render(); showMessage("Task deleted from the database.");
    }
  }).then(() => { if (button.classList.contains("edit-task") && state.editingId === task.id) { titleInput.focus(); titleInput.scrollIntoView({ block: "nearest" }); } });
});
connect();
