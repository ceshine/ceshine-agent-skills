# Partial Staging

Stage part of a file's working-tree changes without staging the rest. `git add -p` is interactive and cannot be used; both methods below build a patch and apply it to the index only with `git apply --cached`.

`<path>` is the file's path relative to `<repo-root>`. Pass `<repo-root>` explicitly; do not rely on the current directory.

`git apply` is all-or-nothing: on a mismatch it refuses and leaves the index untouched. After either method, run `scripts/git-cached-diff.sh <repo-root>` and confirm only the intended changes are staged.

## Method A: Snapshot (for an edit you are about to make)

Use this when the file already has unstaged changes that must stay unstaged, and you are about to edit it (e.g., fixing a review finding). The patch contains only your edit.

1. Before editing, copy the file to a temporary directory outside the repository:
   ```bash
   cp <repo-root>/<path> <tmp-dir>/<name>.before
   ```
2. Make the edit in `<repo-root>/<path>`.
3. Write a patch of only your edit, labeled with `<path>` (`diff` exits 1 when the files differ; that is expected):
   ```bash
   diff -u --label a/<path> --label b/<path> <tmp-dir>/<name>.before <repo-root>/<path> > <tmp-dir>/edit.patch
   ```
4. Apply it to the index:
   ```bash
   git -C <repo-root> apply --cached <tmp-dir>/edit.patch
   ```
5. If `git apply` refuses, the edit is too close to (within 3 lines of) or overlaps the unstaged changes. `--3way` does not help here, because the snapshot is not a blob in the repository. Stop and ask the user whether to stage the whole file or stage the edit themselves with `git add -p`. Do not retry with `-U0`: a patch without context may apply at the wrong place.

## Method B: Hunk filtering (for changes that already exist)

Use this to stage selected hunks of existing working-tree changes (e.g., splitting a file across commits).

1. Extract the full diff for the file:
   ```bash
   git -C <repo-root> diff -- <path> > <tmp-dir>/full_patch.patch
   ```
2. Read the patch and identify which hunks to stage (by their `@@` headers).
3. Write a new patch file containing **only** the target hunks. The file must include:
   - The patch header lines (`diff --git`, `index`, `---`, `+++`)
   - Only the selected `@@ ... @@` hunk sections
   - All context lines (lines starting with a space) within those hunks — do not strip them
4. Apply the filtered patch to the index:
   ```bash
   git -C <repo-root> apply --cached <tmp-dir>/target_hunks.patch
   ```
5. If `git apply` fails (e.g., context mismatch), try with the `--3way` flag as a fallback. If that also fails, inform the user and ask for guidance.

After staging hunks from a file, its working-tree diff changes. Re-extract the diff (`git -C <repo-root> diff -- <path>`) before selecting more hunks from the same file.
