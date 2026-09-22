#!/usr/bin/env bash
# scripts/emdash-gate.sh
# Reaches the one em-dash gate implementation the estate publishes, and makes it
# reachable from a checkout that has had no dependency install.
#
# WHAT THIS FILE IS NOT, and the boundary is the whole point. It carries no pattern, no
# allow-list, no file selection and no verdict. The six banned forms, the scan, the
# exclusion semantics, the self-test and the exit vocabulary all live in
# @cosyte/script-utils, which is the one implementation for the estate. A second copy of
# any of them here would be the fork this repository has just retired, arriving back
# through the door marked "wrapper". What lives here is reachability, and nothing else.
#
# WHAT THIS REPOSITORY LEAVES OUT is declared in scripts/check-no-emdash.exclude, which
# the gate reads for itself. This file neither reads it nor knows what is in it.
#
# WHY IT BOOTSTRAPS AT ALL. The gate's workflow runs checkout, pnpm and Node and then
# this command, with no install step anywhere on the path: a reusable workflow cannot be
# handed one, and a caller job that uses one cannot carry steps of its own. A gate that
# lives in node_modules is therefore not on disk yet at the moment it is called. So the
# INVOCATION carries its own reachability rather than the workflow, and it installs from
# the committed lockfile, which resolves nothing and can only produce the version that
# lockfile already names.
#
# THE PROPERTY THIS TRADES, stated because it is real. Before the adoption, this gate ran
# even when the install was broken, because it was a tracked shell script and nothing
# else. It cannot any more. What replaces that property is the rule below: every route
# out of this file that did not run the gate exits non-zero, names the package on stderr
# and writes NOTHING to stdout. Unreachable must never be indistinguishable from clean,
# because "OK" over a scan that never happened is the failure no re-run undoes.
set -euo pipefail

PACKAGE='@cosyte/script-utils'

# Anchored at the top level. `pnpm run` starts here already, but this file is also run by
# hand from a subdirectory, and both the package directory below and the install resolve
# relative to the working directory.
cd "$(git rev-parse --show-toplevel)"

PACKAGE_DIR="node_modules/${PACKAGE}"

# Everything this file says goes to stderr, so stdout belongs to the gate alone: a caller
# piping stdout gets the gate's output and no progress line of ours mixed into it.
refuse() {
  echo "ERROR: the em-dash gate could not be reached, so it did not run." >&2
  echo "       $1" >&2
  echo "       This repository runs the one implementation ${PACKAGE} publishes and" >&2
  echo "       keeps no copy of its own, so there is no fallback behind it. Refusing to" >&2
  echo "       report a clean tree from a gate that never opened a file." >&2
  exit 1
}

if [ ! -d "$PACKAGE_DIR" ]; then
  command -v pnpm > /dev/null 2>&1 ||
    refuse "${PACKAGE} is not installed, and pnpm is not on PATH to install it."
  echo "NOTE: ${PACKAGE} is not installed. Installing from the committed lockfile." >&2
  # Lifecycle scripts are not what is being fetched here: this needs the gate's bytes on
  # disk and nothing else, and skipping them keeps a scan from installing git hooks as a
  # side effect of being asked a question.
  pnpm install --frozen-lockfile --ignore-scripts >&2 ||
    refuse "${PACKAGE} is not installed and the install from the committed lockfile failed."
fi

# The gate is the shell script the package ships. It is resolved from the installed
# package rather than spelled out here, because that filename belongs to the package that
# owns the implementation, and a second spelling of it tracked in this repository is one
# more thing that can drift from the thing it names. Exactly one is expected; any other
# count is refused rather than guessed at, because guessing here is how a wrapper ends up
# running something that is not the gate and reporting its exit status as though it were.
shopt -s nullglob
candidates=("$PACKAGE_DIR"/*.sh)
shopt -u nullglob

if [ "${#candidates[@]}" -ne 1 ]; then
  refuse "${PACKAGE} is present but ships ${#candidates[@]} shell scripts where exactly one was expected."
fi

# Arguments are forwarded verbatim, which is what reaches the gate's other three modes:
# the message mode CI uses (--stdin LABEL), and the two reporting modes. The gate consumes
# one leading -- of its own, so `pnpm run check:no-emdash -- --stdin LABEL` arrives intact.
exec bash "${candidates[0]}" "$@"
