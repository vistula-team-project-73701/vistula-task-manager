# Task Manager

A public task manager for Practical Assignment 1, Team Project – IT, Vistula University.

- **Student ID:** 73701
- **GitHub account:** vistula-team-project-73701
- **Repository:** https://github.com/vistula-team-project-73701/vistula-task-manager
- **Application:** https://vistula-team-project-73701.github.io/vistula-task-manager/
- **Contributor page:** https://vistula-team-project-73701.github.io/vistula-task-manager/contribution.html
- **Contributor JSON:** https://vistula-team-project-73701.github.io/vistula-task-manager/contribution.json

> Database setup is in progress: the Supabase project must be connected. Both team contribution pull requests have been reviewed and merged.

## Features

Display, add, edit, complete, reopen, and delete tasks. Each task has a title, an optional description, and a completion status. Every change is sent to the Supabase REST API. The list also supports filtering and manual refresh. Error messages explain failed operations, and unsaved form input is retained after a failed save.

HTML, CSS, and plain JavaScript run directly on GitHub Pages. No application server, frontend build step, installation, or user login is required for visitors. `main.py` is only an optional development server.

## Database setup

1. Create a separate, free Supabase demonstration project. Store test data only: all visitors can modify the shared task list.
2. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor. It creates `public.tasks`, enables Row Level Security, grants the public `anon` role CRUD access, and adds one RLS policy per operation.
3. In the project's API settings, copy its project URL and **publishable** key (`sb_publishable_...`). Ensure the Data API exposes the `public` schema.
4. Fill [config.json](config.json):

   ```json
   {
     "supabaseUrl": "https://YOUR_PROJECT_ID.supabase.co",
     "supabasePublishableKey": "sb_publishable_YOUR_PUBLIC_KEY",
     "tableName": "tasks"
   }
   ```

Only the public publishable key belongs in this file. Secret keys, service role keys, management tokens, and database passwords must never be committed. Publishable keys use the `apikey` request header; they are not JWT bearer tokens.

The required table has `id BIGINT` (generated primary key), `title TEXT NOT NULL`, `description TEXT`, and `completed BOOLEAN NOT NULL DEFAULT false`.

## Run locally

```sh
python main.py
```

Open http://127.0.0.1:8000/. The same JavaScript and public database are used locally and after deployment. Opening `index.html` directly as a `file://` URL is not supported because the app loads JSON and JavaScript modules over HTTP.

## Publish on GitHub Pages

1. Use the dedicated course account `vistula-team-project-STUDENT_ID` and create its own public repository named exactly `vistula-task-manager`.
2. Check the student ID in `index.html` and owner information in this README. Commit the application and populated public configuration to `main`.
3. Open repository **Settings → Pages**. Select **Deploy from a branch**, branch **main**, folder **/(root)**, and save.
4. Verify `https://USERNAME.github.io/vistula-task-manager/` and its database operations in a browser. All asset and JSON paths are relative to support the repository subdirectory.

## Team collaboration

The repository owner and contributor must be different students. `contribution.html` and `contribution.json` must arrive through the partner's pull request; do not create them directly on this repository's `main` branch.

Both students already own a repository called `vistula-task-manager`, so give each partner fork a different name (for example, `vistula-task-manager-partner`). The original repositories and deployed paths retain their required names.

The contributor forks the partner repository, creates `feature/team-contribution`, adds only the two required contribution files, and opens a PR against the partner's `main`. The JSON contains the **contributor's** student ID. The HTML has the heading `Team Contribution`, a `#load-contributor` button labelled `Show Contributor`, a `#contributor-student-id` element, and an `index.html` link. On click, it fetches `contribution.json` and displays its `contributorStudentId` value. The receiving repository owner reviews and merges the PR. Repeat in the opposite direction.

- **Partner:** student 72930, [vistula-team-project-72930](https://github.com/vistula-team-project-72930).
- **My contribution to my partner's repository (merged PR):** [Add contributor page – 73701](https://github.com/vistula-team-project-72930/vistula-task-manager/pull/1).
- **My partner's contribution to this repository (merged PR):** [Add contributor page – 72930](https://github.com/vistula-team-project-73701/vistula-task-manager/pull/1).

## Verification

Development checks require Node.js; visitors do not need Node.js or Python.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

API and browser tests use an isolated mock database. Browser tests cover CRUD, page refresh, error recovery, text rendering, validation, filters, edit cancellation, and desktop/mobile layouts at a GitHub Pages style subdirectory. These checks do not establish that a real Supabase project is configured.

After configuring the real demonstration project, run a live CRUD check. It creates a uniquely named test task and deletes that task afterward:

```sh
npm run test:live
node scripts/check-live.mjs https://USERNAME.github.io/vistula-task-manager/
```

Before submission, also verify the deployed contributor button, public JSON, and both merged PRs. Submit only the main application's GitHub Pages URL in Platon.

## References

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [GitHub Pages publishing from a branch](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub CLI fork options](https://cli.github.com/manual/gh_repo_fork)
