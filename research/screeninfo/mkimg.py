#!/usr/bin/env python3
"""Emulator-only probe images for the shooting-screen item research (2026-11-14). NEVER for the camera.

    mkimg.py set OUT 'var:off:len[:val],...'    # hk_set.s: overwrite bytes of a GUI variable as it is set (mapping)
    mkimg.py upd OUT 'slot:len:off,...'         # hk_upd.s: clear item fields in the shooting-screen updater (prototype)

Takes the stock decoded main block from $OM3_MAIN (made by research/setup.sh; never in the repo), assembles the probe
with the workspace toolchain ($OM3_TOOLCHAIN) and writes OUT for tools/emulator/session_ed1.mjs. POKE=ADDR=HEX,...
(hex, run-time addresses) adds raw byte patches. Probe code sits in section 10's FF tail (0x61aa4300..), which om-emu
maps; whether a camera build may use that spot is a separate question (firmware/editor.ld), not this script's.
"""
import os, struct, subprocess, sys, tempfile

BASE = 0x60021020
HERE = os.path.dirname(os.path.abspath(__file__))
TC = os.environ.get('OM3_TOOLCHAIN')

# probe: (source, load address, table address, entry patch site, stock bytes there, return address)
PROBES = {
    'set': ('hk_set.s', 0x61aa4300, 0x61aa4400, 0x610cd5c4, '92fca0e4f63660', 0x610cd5cb),   # GUI variable set
    'upd': ('hk_upd.s', 0x61aa4500, 0x61aa4600, 0x6123043d, 'fcdc54ebce62', 0x61230443),     # updater, before its check
}


def assemble(src, org, tbl, back):
    with tempfile.TemporaryDirectory() as d:
        o, e, b = (os.path.join(d, x) for x in ('p.o', 'p.elf', 'p.bin'))
        subprocess.run([f'{TC}/gas/as-new', '-o', o, os.path.join(HERE, src)], check=True)
        subprocess.run([f'{TC}/ld/ld-new', '-e', '0', f'-Ttext={org:#x}', f'--defsym=back={back:#x}',
                        f'--defsym=back2={back:#x}', f'--defsym=tbl={tbl:#x}', f'--defsym=tbl2={tbl:#x}', '-o', e, o],
                       check=True)
        subprocess.run([f'{TC}/binutils/objcopy', '-O', 'binary', '-j', '.text', e, b], check=True)
        return open(b, 'rb').read()


def main():
    kind, out, spec = sys.argv[1], sys.argv[2], sys.argv[3]
    src, org, tbl, site, stock, back = PROBES[kind]
    B = bytearray(open(os.environ['OM3_MAIN'], 'rb').read())

    def put(a, b): B[a - BASE:a - BASE + len(b)] = b
    assert B[org - BASE:tbl + 0x100 - BASE] == b'\xff' * (tbl + 0x100 - org), 'probe area is not free (FF)'
    assert bytes(B[site - BASE:site - BASE + len(stock) // 2]) == bytes.fromhex(stock), 'not the stock 1.1 bytes'
    code = assemble(src, org, tbl, back)
    assert len(code) <= tbl - org
    put(org, code)
    t = b''
    for x in filter(None, spec.split(',')):
        p = x.split(':')
        if kind == 'set':      # {u16 var, u16 off, u16 len, u16 val}, var 0xffff ends
            t += struct.pack('<4H', int(p[0]), int(p[1]), int(p[2]), int(p[3], 16) if len(p) > 3 else 0)
        else:                  # {u8 sp slot, u8 len, u16 off}, slot 0 ends
            t += struct.pack('<BBH', int(p[0]), int(p[1]), int(p[2]))
    t += struct.pack('<4H', 0xffff, 0, 0, 0) if kind == 'set' else b'\0' * 4
    put(tbl, t)
    jmp = b'\xdc' + struct.pack('<i', org - site)                       # jmp (d32,PC)
    put(site, jmp + b'\xcb' * (len(stock) // 2 - len(jmp)))          # + nop to the end of the replaced instruction(s)
    for kv in filter(None, os.environ.get('POKE', '').split(',')):
        a, h = kv.split('=')
        put(int(a, 16), bytes.fromhex(h))
    open(out, 'wb').write(B)


if __name__ == '__main__':
    main()
