# Game of AGI

A static site (no build step): `index.html` (Three.js scene, UI), `model.js` (world model),
`events.js` (campaign cards), `landmask.js` (globe coastlines), `trees.js` (memtree links).
Live at https://agi.memtree.dev via GitHub Pages from `main`.

This repo is a public showcase of memtree: the conversations that build it are published as
memtrees, and the page links them under "How it was built".

## Before every push

1. `node test-model.js`. Plan A, Burn the lead and Race to ASI should stay close to
   AI 2040's p(alignment) medians (72%, 40%, 25%). Explain any drift in the commit message.
2. Update `trees.js` with the **latest** tree of the current session. Trees are regenerated as
   a session grows, so the link from earlier in the session is stale. Get it with the memtree
   `list` tool (project `ai-safety-sim`) to find the session's latest tree, then use that
   tree's **public share link**. The `app.polychat.co/usage/...` URL the tool prints needs
   sign-in, so never put it in `trees.js`; leave `url: null` until a public link exists.
   Update that session's entry if it exists, otherwise append a new entry (newest last), and
   set `updated` to today's date.
3. Scan for sensitive info before pushing: no local paths, emails, keys or tokens.
4. `python3 scripts/stamp_version.py` so browsers fetch the new files instead of cached ones.
5. Commit and push. Pages redeploys on its own.
