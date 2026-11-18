#!/usr/bin/env python3
"""Issue #54 in om-emu: a live mode-dial turn's in-between close, simulated.

On the camera a live dial turn closes twice (setting 1440): first with the mode's code 0 at the new dial position,
before the camera has put the new mode's own settings in, then with the mode's code (crombach's CADLOG). om-emu closes
once, with the code, so it never shows the bug by itself. This script builds a SIMULATION copy of a commit's firmware
(never for a camera): at the 897 write that opens a dial change, when the byte sim_arm is set, it runs the dial-turn
code (rc_turn when the commit has it, else rc_go, as sx_set's 1440 did before the fix) with the mode's code read as 0,
then lets the change go on. Then: C1 assigned from P (emu_test's BOOT1_ASSIGN_C1), boot in M, half-press, M -> C1 ->
M with the simulated close each time, and M's picture mode and the Reset check are read from CADLOG.

    . $OM3_WORK/env.sh; OM3_EMU=... python3 research/emulator/issue54_sim.py [--commit REV] [--out DIR]

Emulator only. Results (2026-11-15, om-emu 0819080): 6fd2988 (before the fix) "BUG": M ends on 54 = COLOR 1, FILM 5
(C1's film; M was on 55 = COLOR 2, FILM 6), the switch logged at code C7, 22 camera values differ from C1's own;
770f40d (the fix) "ok": M on 55 = COLOR 2, FILM 6, none differ, 2 closes left alone.
"""
import argparse, io, os, pathlib, re, subprocess, sys, tarfile, tempfile

REPO = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools/test'))
import emu_test as T  # noqa: E402

ANCHOR = """sx_set:                           /* from sl_set (entered as the manager: d0 id, d1 value, a0, a1; frame 68) */
 mov a0,(rc_in)                   /* v0.30-dev k1 (#41): the manager's own handle (one per power-on), for rc_put */
"""
INJECT = """ cmp 897,d0                       /* SIMULATION ONLY (#54): the camera's in-between close of a live dial turn */
 bne 77f
 movbu (sim_arm),d2
 cmp 0,d2
 beq 77f
 clr d2
 movbu d2,(sim_arm)
 mov d0,(sim_r)
 mov d1,(sim_r + 4)
 mov a0,(sim_r + 8)
 mov a1,(sim_r + 12)
 movbu (24,a0),d2
 movbu d2,(sim_c)
 clr d2
 movbu d2,(24,a0)
 call dm_ok,[],0
 cmp 0,d1
 beq 76f
 add -4,sp
 call {fn},[d2,d3,a2,a3],24
 add 4,sp
76:
 mov (sim_r + 8),a0
 movbu (sim_c),d2
 movbu d2,(24,a0)
 mov (sim_r),d0
 mov (sim_r + 4),d1
 mov (sim_r + 12),a1
77:
"""
DATA_ANCHOR = 'cm_pms:\n .long 0\n'
DATA = 'sim_r:\n .long 0, 0, 0, 0\nsim_arm:\n .byte 0\nsim_c:\n .byte 0\n .balign 4\n'
M_LINE = re.compile(r'^Picture mode setting: (.*)$')
DIFF_LINE = re.compile(r"^Per-mode settings: camera COLOR values that differed from a Reset custom mode's own: (\d+)")


def sim_build(rev, work):
    src = work / 'src'
    src.mkdir(parents=True)
    tar = subprocess.run(['git', 'archive', rev, 'firmware', 'card'], cwd=REPO, capture_output=True, check=True).stdout
    tarfile.open(fileobj=io.BytesIO(tar)).extractall(src)
    ed = src / 'firmware/src/editor.s'
    s = ed.read_text()
    fn = 'rc_turn' if '\nrc_turn:' in s else 'rc_go'
    assert s.count(ANCHOR) == 1 and s.count(DATA_ANCHOR) == 1, 'sx_set / cm_pms not found: update the anchors'
    s = s.replace(ANCHOR, ANCHOR + INJECT.format(fn=fn)).replace(DATA_ANCHOR, DATA + DATA_ANCHOR)
    ed.write_text(s)
    out = work / 'build'
    r = subprocess.run([sys.executable, src / 'firmware/build.py', '--stock', os.environ['OM3_STOCK'],
                        '--toolchain', os.environ['OM3_TOOLCHAIN'], '--out', out], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stdout[-2000:] + r.stderr[-2000:])
    nm = subprocess.run([pathlib.Path(os.environ['OM3_TOOLCHAIN']) / 'binutils/nm-new', out / 'p.elf'],
                        capture_output=True, text=True, check=True).stdout
    arm = next(l.split()[0] for l in nm.splitlines() if l.split()[-1] == 'sim_arm')
    return out, fn, arm


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--commit', default='HEAD')
    ap.add_argument('--out', type=pathlib.Path)
    a = ap.parse_args()
    emu = os.environ.get('OM3_EMU')
    if not emu or not pathlib.Path(emu, 'bin/card.mjs').exists():
        sys.exit('OM3_EMU must be an om-emu emu/ folder with bin/card.mjs (as tools/test/emu_test.py)')
    work = (a.out or pathlib.Path(tempfile.mkdtemp(prefix='issue54-'))).resolve()
    work.mkdir(parents=True, exist_ok=True)
    build, fn, arm = sim_build(a.commit, work)
    card0 = work / 'card0.omsd'
    T.make_card(emu, build, T.newest_looks(), card0)
    turns = (f'wait wait wait s1 wait wait pokeb:{arm}=1 mode:{T.MODE_DIAL_C1} wait wait wait s1 wait wait '
             f'pokeb:{arm}=1 mode:{T.MODE_DIAL_M} wait wait wait s1 wait wait poweroff')
    name, errors = T.run_test('issue54', [T.Boot(T.BOOT1_ASSIGN_C1), T.Boot(turns, mode_dial=T.MODE_DIAL_M)],
                              emu, build, card0, work)
    if errors:
        sys.exit('\n'.join(errors))
    lines = (work / 'issue54/cadlog2.txt').read_text(errors='replace').splitlines()
    m = next(M_LINE.match(l).group(1) for l in lines if M_LINE.match(l))
    d = int(next(DIFF_LINE.match(l).group(1) for l in lines if DIFF_LINE.match(l)))
    ok = re.search(T.P_FILM_LINE, f'Picture mode setting: {m}') is not None and d == 0
    print(f'{"ok " if ok else "BUG"} {a.commit} (simulated close runs {fn}): M on {m}; camera values that differ from '
          f"C1's own: {d}. Results in {work}")
    for l in lines:
        if l.startswith('Custom modes') or 'left alone' in l:
            print('   ', l)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
