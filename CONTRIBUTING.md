# Contributing to LexFlow

How to take an issue from assigned to merged. Setup lives in [`SETUP.md`](SETUP.md);
what the system does and why is in [`docs/`](docs/).

## 1. Before you start

Issues are assigned, not first-come. Work the ones assigned to you; if you want
one that isn't, ask rather than pushing to it.

**Comment on the issue before you write code.** One line saying you've started
and how you plan to fix it. That's where a wrong approach gets caught cheaply —
after the PR is open it costs a rewrite.

**Some issues are deliberately not ready.** Several say *"pick this up when:"*
followed by a trigger — real latency complaints, a live API key, a 500 seen in
logs. Those are tracked so they aren't forgotten, not queued for now. If the
trigger hasn't happened, say so on the issue instead of building it.

Issues that name another issue (`Depends on #N`, `the same scheduler that would
serve #N`) are assigned to the same person on purpose. Land the dependency first.

## 2. Branch

Cut from `develop`, never from `main`:

```bash
git checkout develop && git pull
git checkout -b feature/short-description
```

`feature/<short-description>` — the existing branches (`feature/auth`,
`feature/frontend-ui`, `feature/backend-ml`) are the pattern.

## 3. Make the change

Every issue names the files and line numbers it's about. Read those first, then
grep for other callers of whatever you're about to change — the fix usually
belongs in the shared function, not in the one path the issue happened to name.

**`ponytail:` comments mark deliberate trade-offs, not bugs.** A comment saying
a query filters in Python or a model reloads per call is a decision with a
recorded reason and an upgrade path. Don't "fix" one unless an issue asks for
it. If you're changing something a `ponytail:` comment covers, update or delete
the comment in the same commit.

**Schema changes need a migration file.** Add `backend/migrate_<what>.sql`
alongside the existing ones — don't edit `seed.sql` or change a table by hand in
the Supabase dashboard. Nobody else's database gets the change otherwise.

**Don't relax these to make something work:** auth and role checks
(`backend/app/middleware/auth.py`), per-case ownership checks, input validation
on request models, or the HMAC verification in `billing.py` / `esign.py`. If one
of them is in your way, that's an issue to raise, not an edit to make.

## 4. Test it

Backend, from `backend/`:

```bash
source .venv/bin/activate
SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key pytest -q
```

The dummy values are what CI uses — tests mock the Supabase client, the env vars
just satisfy `config.py` so imports don't fail.

Frontend, from `frontend/`:

```bash
npm run build   # tsc -b && vite build -- type errors fail here
npm run lint
```

**A bug fix needs a test that fails without it.** `backend/tests/` has one module
per controller; add to the matching one. If you can't write a failing test, you
probably haven't found the root cause yet.

For anything touching a real user flow, also click through it in the running app
(`./start.sh`). Three of the recent `fix:` commits came from an end-to-end run
finding what unit tests didn't.

## 5. Commit

Conventional prefixes, matching the existing log:

```
fix: stop serving deleted documents and accepting arbitrary uploads
feat: add view/edit for clients on the Users page
test: add the end-to-end checks that found this round of bugs
docs: ...    refactor: ...    chore: ...
```

Imperative mood, lowercase after the prefix, and say what changed in terms of
behaviour — not "update documents.py". Keep unrelated changes in separate
commits.

## 6. Open the PR

Target `develop`, not `main`:

```bash
gh pr create --base develop --fill
```

In the body:

- `Closes #N` so the issue closes on merge.
- What you changed and why, in a few sentences.
- How you verified it — the test you added, the flow you clicked through.
- Anything you deliberately left out, and why.

CI must be green before review. Backend tests run on any `backend/**` change;
once #15 lands, the frontend build and lint run too.

## 7. Review

Expect comments, including on things that work. The bar is whether the next
person can read it at 3am, not whether it passes.

Push fixes as new commits on the same branch — don't force-push a branch that's
under review, it throws away the reviewer's place in the diff.

Squash-merge once approved and CI is green. Delete the branch after.

## Questions

Ask on the issue, not in DMs — the answer is usually useful to whoever picks up
the next one.
