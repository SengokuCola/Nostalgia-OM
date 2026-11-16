#!/usr/bin/env python3
"""Fast static checks on a firmware build, run before every pull request (research/TESTING.md, "Static build checks").

    python3 tools/test/static_check.py BUILD_DIR [--stock PATH] [--all-releases] [--write-hooks]

BUILD_DIR is a firmware/build.py --out folder (main.bin, p.elf). --stock is the official OLY_E_147_1100_0000_0000.BIN
(or its decoded main block). Default: $OM3_STOCK, then $OM3_WORK/stock (default ~/om3-work). Exit 0 when every check passes.
--write-hooks rewrites tools/test/hooks.json from BUILD_DIR. Do that only after reviewing each difference.

Importers use CHECKS: name -> fn(build: Path, stock: Path) -> list of failure strings (empty = pass).
A check that cannot run soundly raises Skip.
"""
import argparse, ast, bisect, functools, hashlib, json, os, pathlib, re, struct, subprocess, sys, tempfile, time

REPO = pathlib.Path(__file__).resolve().parents[2]
HOOKS_FILE = REPO / 'tools/test/hooks.json'
BUILD_PY = REPO / 'firmware/build.py'
EDITOR_S = REPO / 'firmware/src/editor.s'
PATCH_PY = REPO / 'firmware/patch.py'
RELEASES = REPO / 'releases'
WORK = pathlib.Path(os.environ.get('OM3_WORK') or pathlib.Path.home() / 'om3-work')
VENV_PYTHON = WORK / 'venv/bin/python'
STOCK_CANDIDATES = (WORK / 'stock/OLY_E_147_1100_0000_0000.BIN',)

MAIN_BASE = 0x60021020
MAIN_SHA = '5e8d376e9111a44ac0352f26030d7c1b17026d42c45f3600cfa02a0e8c5b7d59'
PACKAGE_PATH = 'DCOLYMP/E1479999.BIN'  
HOOK_PREFIX = '.hook_'
EXT_PREFIX = '.ext'
LOADER_END_WORD = 0x60045e9c           
EXT_SPACE_LIMIT = 0x6103f000              # camera-proven end of the extended space
BUILTIN_START = 0x60f99800                # Keep in sync with EXT12[1] in build.py
CHUNK = 256
SHT_PROGBITS, SHF_ALLOC = 1, 2
RELEASE_TIMEOUT_S = 300
MAX_LISTED = 12
REVIEW_HOOK = ('review it against the start-up rule in CLAUDE.md (no work of ours while the camera starts), '
               'then update tools/test/hooks.json (static_check.py BUILD_DIR --write-hooks)')
REVIEW_SITE = ('check it is an intended patch site and not a stray write, then update tools/test/hooks.json '
               '(static_check.py BUILD_DIR --write-hooks)')


class Skip(Exception):
    pass


def hx(n):
    return f'0x{n:08x}'


# ---------------------------------------------------------------- inputs

def elf_sections(path):
    if not path.is_file():
        raise Skip(f'{path} is missing')
    d = path.read_bytes()
    shoff, = struct.unpack_from('<I', d, 0x20)
    entsize, num, strndx = struct.unpack_from('<HHH', d, 0x2e)
    secs = [struct.unpack_from('<10I', d, shoff + i * entsize) for i in range(num)]
    names = secs[strndx][4]
    out = {}
    for name, typ, flags, addr, off, size, *_ in secs:
        if typ == SHT_PROGBITS and flags & SHF_ALLOC:
            n = d[names + name:d.index(b'\0', names + name)].decode()
            out[n] = (addr, size, off)
    return out, d


def patched_sections(build):
    secs, _ = elf_sections(build / 'p.elf')
    return {n: (a, s) for n, (a, s, _) in secs.items() if n.startswith((HOOK_PREFIX, EXT_PREFIX))}


@functools.lru_cache(maxsize=None)
def stock_main(stock):
    raw = pathlib.Path(stock).read_bytes()
    if hashlib.sha256(raw).hexdigest() == MAIN_SHA:
        return raw
    code = ('import sys; sys.path.insert(0, sys.argv[1]); import oe_container; '
            'sys.stdout.buffer.write(oe_container.parse(open(sys.argv[2], "rb").read())[0]["dec"])')
    for py in (sys.executable, str(VENV_PYTHON)):
        r = subprocess.run([py, '-c', code, str(REPO / 'firmware'), str(stock)], capture_output=True)
        if r.returncode == 0 and hashlib.sha256(r.stdout).hexdigest() == MAIN_SHA:
            return r.stdout
    raise Skip(f'cannot decode the main block from {stock} (needs numpy: try {VENV_PYTHON})')


def read_main(build):
    f = build / 'main.bin'
    if not f.is_file():
        raise Skip(f'{f} is missing')
    return f.read_bytes()


def hooks_of(build):
    secs, d = elf_sections(build / 'p.elf')
    m = read_main(build)
    out, problems = {}, []
    for n, (a, size, off) in secs.items():
        if n.startswith(HOOK_PREFIX):
            out[n[1:]] = (a, size)
            if m[a - MAIN_BASE:a - MAIN_BASE + size] != d[off:off + size]:
                problems.append(f'{n[1:]} at {hx(a)} is assembled but not in main.bin')
    return out, problems


def load_baseline():
    return json.loads(HOOKS_FILE.read_text())


# ---------------------------------------------------------------- changed bytes

def changed_runs(m, s):
    if len(m) != len(s):
        raise Skip(f'main.bin is {len(m)} B, the stock main block {len(s)} B')
    pos = []
    for base in range(0, len(m), CHUNK):
        if m[base:base + CHUNK] != s[base:base + CHUNK]:
            pos += [i for i in range(base, min(base + CHUNK, len(m))) if m[i] != s[i]]
    return pos


def group(pos):
    runs = []
    for p in pos:
        if runs and runs[-1][0] + runs[-1][1] == p:
            runs[-1][1] += 1
        else:
            runs.append([p, 1])
    return runs


def uncovered_positions(pos, intervals):
    intervals = sorted(intervals)
    starts = [a for a, _ in intervals]
    out = []
    for p in pos:
        i = bisect.bisect_right(starts, p) - 1
        if i < 0 or p >= intervals[i][1]:
            out.append(p)
    return out


def known_intervals(build, m):
    iv = [(a - MAIN_BASE, a - MAIN_BASE + n) for a, n in patched_sections(build).values()]
    end, = struct.unpack_from('<I', m, LOADER_END_WORD - MAIN_BASE)
    iv.append((LOADER_END_WORD - MAIN_BASE, LOADER_END_WORD - MAIN_BASE + 4))
    if BUILTIN_START < end <= EXT_SPACE_LIMIT:
        iv.append((BUILTIN_START - MAIN_BASE, end - MAIN_BASE))
    return iv


def site_positions(build, stock):
    m, s = read_main(build), stock_main(stock)
    return uncovered_positions(changed_runs(m, s), known_intervals(build, m))


def site_runs(build, stock):
    return [f'{hx(MAIN_BASE + a)}:{n}' for a, n in group(site_positions(build, stock))]


# ---------------------------------------------------------------- checks

def release_order(v):
    num, _, pre = v.lstrip('v').partition('-')        # Keep in sync with vkey in patch.py
    return [int(x) for x in num.split('.')], pre == '', pre


def release_rebuild(build, stock, all_releases=False):
    if hashlib.sha256(pathlib.Path(stock).read_bytes()).hexdigest() == MAIN_SHA:
        raise Skip('--stock must be the official .BIN file, not the decoded block')
    py = sys.executable
    try:
        __import__('numpy')
    except ImportError:
        py = str(VENV_PYTHON)
    rels = sorted((d.name for d in RELEASES.iterdir() if (d / 'patch.json').is_file() and (d / 'SHA256SUMS').is_file()),
                  key=release_order)
    if not rels:
        raise Skip('no release folders')
    fails = []
    for rel in rels if all_releases else rels[-1:]:
        want = next((l.split()[0] for l in (RELEASES / rel / 'SHA256SUMS').read_text().splitlines()
                     if len(l.split()) > 1 and l.split()[1] == PACKAGE_PATH), None)
        if not want:
            fails.append(f'{rel}: SHA256SUMS has no {PACKAGE_PATH} line')
            continue
        t0 = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([py, str(PATCH_PY), '--release', rel, '--stock', str(stock), '--out', tmp],
                               capture_output=True, text=True, timeout=RELEASE_TIMEOUT_S)
            pkg = pathlib.Path(tmp) / PACKAGE_PATH
            got = hashlib.sha256(pkg.read_bytes()).hexdigest() if pkg.is_file() else None
        took = time.time() - t0
        print(f'  {rel}: {"match" if got == want else "MISMATCH"} in {took:.1f} s')
        if got != want:
            fails.append(f'{rel}: patch.py made {got or "no package (" + (r.stdout + r.stderr).strip()[-200:] + ")"}, '
                         f'SHA256SUMS says {want}')
    return fails


def hook_list(build, stock):
    now, problems = hooks_of(build)
    want = {k: (int(v['addr'], 16), v['len']) for k, v in load_baseline()['hooks'].items()}
    fails = list(problems)
    for k in sorted(now.keys() - want.keys()):
        fails.append(f'added hook {k} at {hx(now[k][0])}, {now[k][1]} B: {REVIEW_HOOK}')
    for k in sorted(want.keys() - now.keys()):
        fails.append(f'removed hook {k} (was {hx(want[k][0])}, {want[k][1]} B): {REVIEW_HOOK}')
    for k in sorted(now.keys() & want.keys()):
        if now[k] != want[k]:
            fails.append(f'changed hook {k}: was {hx(want[k][0])}, {want[k][1]} B, now {hx(now[k][0])}, '
                         f'{now[k][1]} B: {REVIEW_HOOK}')
    return fails


def editor_source():
    """editor.s and the files in firmware/src it includes (rgbcurves.inc, colourmix.inc hold hooks of their own)."""
    text = EDITOR_S.read_text()
    for name in re.findall(r'^\s*\.include\s+"([^"]+)"', text, re.M):
        if (EDITOR_S.parent / name).is_file():
            text += '\n' + (EDITOR_S.parent / name).read_text()
    return text


def hook_sections(build, stock):
    in_s = set(re.findall(r'^\s*\.section\s+\.hook_(\w+)', editor_source(), re.M))
    placed = set()
    for node in ast.walk(ast.parse(BUILD_PY.read_text())):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'HOOKS' for t in node.targets):
            placed = {k.value[len(HOOK_PREFIX):] for k in node.value.keys if isinstance(k, ast.Constant)}
    if not placed:
        raise Skip('build.py has no HOOKS dict literal')
    return ([f'.section .hook_{n} in editor.s (or a file it includes) has no entry in build.py HOOKS' for n in sorted(in_s - placed)] +
            [f'build.py HOOKS places .hook_{n}, but editor.s (and the files it includes) has no such section' for n in sorted(placed - in_s)])


def changed_bytes(build, stock):
    """Hooks, section tails, the loader word and the built-in files come from the build. The scattered patch sites
    (call displacements, table words, descriptors) have no source in the build dir, so hooks.json holds a reviewed
    snapshot of them instead."""
    pos = site_positions(build, stock)
    want = load_baseline()['patch_sites']
    runs = {r: (int(r.split(':')[0], 16) - MAIN_BASE, int(r.split(':')[1])) for r in want}
    # A patched word can match the stock byte by chance (a pointer into our code that moved), so a reviewed run may
    # shrink. Each changed byte must lie in a reviewed run, and each reviewed run must still change a byte.
    new = [f'{hx(MAIN_BASE + a)}:{n}' for a, n in group(uncovered_positions(pos, [(a, a + n) for a, n in runs.values()]))]
    hit = {r for r, (a, n) in runs.items() if (i := bisect.bisect_left(pos, a)) < len(pos) and pos[i] < a + n}
    gone = sorted(set(want) - hit)
    fails = [f'new changed run {r} (address:length): {REVIEW_SITE}' for r in new[:MAX_LISTED]]
    fails += [f'changed run {r} is gone: {REVIEW_SITE}' for r in gone[:MAX_LISTED]]
    more = len(new) + len(gone) - len(fails)
    return fails + ([f'... and {more} more'] if more > 0 else [])


def loader_end(build, stock):
    m = read_main(build)
    s = stock_main(stock)
    word, = struct.unpack_from('<I', m, LOADER_END_WORD - MAIN_BASE)
    base, = struct.unpack_from('<I', s, LOADER_END_WORD - MAIN_BASE)
    need, why = base, 'the stock end'
    for n, (a, size) in patched_sections(build).items():
        if n.startswith(EXT_PREFIX) and base <= a < EXT_SPACE_LIMIT and a + size > need:
            need, why = a + size, f'the end of {n}'
    pos = [p for p in changed_runs(m, s) if base <= MAIN_BASE + p < EXT_SPACE_LIMIT and not LOADER_END_WORD <= MAIN_BASE + p < LOADER_END_WORD + 4]
    if pos and MAIN_BASE + pos[-1] + 1 > need:
        need, why = MAIN_BASE + pos[-1] + 1, f'the last changed byte, {hx(MAIN_BASE + pos[-1])}'
    fails = []
    if word < need:
        fails.append(f'loader end word is {hx(word)}, below {hx(need)} ({why}): code or data past it is not loaded')
    if word > EXT_SPACE_LIMIT:
        fails.append(f'loader end word {hx(word)} is past the proven limit {hx(EXT_SPACE_LIMIT)}')
    return fails


CHECKS = {'release-rebuild': release_rebuild, 'hook-list': hook_list, 'hook-sections': hook_sections,
          'changed-bytes': changed_bytes, 'loader-end': loader_end}


# ---------------------------------------------------------------- command line

def find_stock(arg):
    for c in (arg, os.environ.get('OM3_STOCK'), *STOCK_CANDIDATES):
        if c and pathlib.Path(c).is_file():
            return pathlib.Path(c)
    sys.exit('no stock firmware found: pass --stock PATH or set OM3_STOCK')


def write_hooks(build, stock):
    hooks, problems = hooks_of(build)
    if problems:
        sys.exit('\n'.join(problems))
    data = {'hooks': {k: {'addr': hx(a), 'len': n} for k, (a, n) in sorted(hooks.items())},
            'patch_sites': site_runs(build, stock)}
    HOOKS_FILE.write_text(json.dumps(data, indent=1) + '\n')
    print(f'wrote {HOOKS_FILE}: {len(hooks)} hooks, {len(data["patch_sites"])} patch sites')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('build', type=pathlib.Path)
    ap.add_argument('--stock')
    ap.add_argument('--all-releases', action='store_true', help='rebuild every release, not only the newest')
    ap.add_argument('--write-hooks', action='store_true', help='rewrite hooks.json from BUILD_DIR')
    a = ap.parse_args()
    stock = find_stock(a.stock)
    if a.write_hooks:
        return write_hooks(a.build, stock)
    bad = 0
    for name, fn in CHECKS.items():
        t0 = time.time()
        try:
            fails = fn(a.build, stock, a.all_releases) if name == 'release-rebuild' else fn(a.build, stock)
        except Skip as e:
            print(f'skip  {name}: {e}')
            continue
        print(f'{"FAIL" if fails else "pass"}  {name} ({time.time() - t0:.1f} s)')
        for f in fails:
            print(f'      {f}')
        bad += bool(fails)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
