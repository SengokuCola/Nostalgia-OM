#!/usr/bin/env python3
"""Claude Code PreToolUse hook (.claude/settings.json): refuses to open a pull request whose branch changes
TESTED_PATHS until tools/test/emu_test.py has passed on the branch's HEAD commit."""
import json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

# `gh [global flags] pr create|new`, the alias included.
PR_CREATE = re.compile(r'\bgh\b[^\n;&|]*?\bpr\s+(?:create|new)\b')
BASES = ('upstream/main', 'origin/main', 'main')
HOW = ('Build this commit (firmware/build.py --out DIR), run python3 tools/test/emu_test.py DIR on it '
       '(research/TESTING.md), commit nothing in between, then open the pull request.')


def opens_pr(call):
    tool = call.get('tool_name', '')
    if tool.endswith('create_pull_request'):
        return True
    return tool == 'Bash' and bool(PR_CREATE.search(call.get('tool_input', {}).get('command', '')))


def changed_paths(cwd):
    from emu_test import git
    base = next((b for b in BASES if git('rev-parse', '--verify', '--quiet', b, cwd=cwd)), None)
    out = git('diff', '--name-only', f'{base}...HEAD', cwd=cwd) if base else None
    return None if out is None else out.splitlines()


def reason(cwd):
    from emu_test import TESTED_PATHS, git, read_pass
    paths = changed_paths(cwd)
    if paths is None:
        return 'no main branch to compare against, so the changed files are unknown. ' + HOW
    if not any(p.startswith(TESTED_PATHS) for p in paths):
        return None
    head = git('rev-parse', 'HEAD', cwd=cwd)
    passed = read_pass(cwd)
    if not passed:
        return f'the emulator suite has not passed on this branch. {HOW}'
    if passed.get('head') != head:
        return f'the emulator suite last passed on {passed.get("head", "?")[:12]}, not on HEAD {head[:12]}. {HOW}'
    return None


def main():
    call = json.load(sys.stdin)
    if not opens_pr(call):
        return
    try:
        why = reason(call.get('cwd') or '.')
    except Exception as e:   # a crashed hook exits non-zero, which Claude Code treats as allow
        why = f'the check itself failed ({e!r}). {HOW}'
    if why:
        print(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse', 'permissionDecision': 'deny',
            'permissionDecisionReason': f'Pull request blocked: {why}'}}))


if __name__ == '__main__':
    main()
