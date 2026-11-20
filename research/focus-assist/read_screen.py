"""Decode SCREEN VISUAL TEST 2 in CADLOG.TXT; observations, not camera-proof guesses."""
import argparse
import json
import re
from pathlib import Path

STATE = 'on checked frames owner owner_ch epoch busy last'.split()
COUNTS = 'update tick stop th gate mask ch cap why pub capN pubN cancel busy gui psw'.split()
REGS = 'DMAEN IMG1DMASADR IMG1DMALD IMG1DMABN IMGDMASPOS IMG1FMT IMG1AREA1 IMG1AREA2 IMG1RSZ1 IMG1RSZ2 IMG1RSZ3 IMG1RSZ4 IMG1RSZ5 IMG2DMASADR IMG2FMT IMG2PLANC'.split()
REASONS = {1: 'channel or destination pointer', 2: 'IMG1 disabled or unsupported format',
           3: 'source stride', 4: 'source address, bank or start position', 5: 'display dimensions',
           6: 'resize mode or offsets', 7: 'horizontal scale', 8: 'vertical scale',
           9: 'horizontal span or DMA burst', 10: 'read crosses bank allocation',
           11: 'read crosses bus window', 12: 'CPU index', 13: 'display changed during capture',
           14: 'only the source buffer address changed during capture'}


def decode(text):
    if 'SCREEN VISUAL TEST 2 - diagnostics' not in text:
        raise ValueError('This log has no screen-test-2 diagnostics; it cannot locate the blocked stage.')
    result = {}
    for prefix, names in [('SC', STATE), ('SD', COUNTS), ('SL', REGS[:13]), ('STFT', REGS), ('SEVF', REGS)]:
        line = next((s for s in text.splitlines() if s.startswith(prefix + ' ')), None)
        if line is None:
            if prefix != 'SC' and result.get('SC', {}).get('on') != 1:
                continue
            raise ValueError('Missing diagnostic row: ' + prefix)
        fields = line.split(':', 1)[-1].split()
        if len(fields) != len(names) or any(not re.fullmatch(r'[0-9a-fA-F]{8}', s) for s in fields):
            raise ValueError('Malformed or truncated row: ' + prefix)
        result[prefix] = dict(zip(names, (int(s, 16) for s in fields)))
    state, counts = result['SC'], result.get('SD', {})
    has_latched_rows = (
        'screen test 7' in text or 'XPan ZAF test ' in text or 'XPan and shutter beep test ' in text
        or 'XPan and shutter sound test ' in text or 'XPan boot guard test ' in text or 'XPan contrast test ' in text
    )
    for device in ('TFT', 'EVF'):
        key = f'TH_{device}'
        fields = next((line.split(':', 1)[1].split() for line in text.splitlines()
                       if line.startswith(key + ' ')), [])
        if fields:
            names = 'mask format resize fromXY area src dst toXY fitXY size aspect'.split()
            if len(fields) != len(names) or any(not re.fullmatch(r'[0-9a-fA-F]{8}', v) for v in fields):
                raise ValueError('Malformed through geometry: ' + key)
            result[key] = dict(zip(names, (int(v, 16) for v in fields)))
    latched = re.search(r'^EVF source changes while original stayed latched: ([0-9a-fA-F]{8}) *\r?$', text, re.M)
    if latched:
        result['EVF_LATCHED'] = int(latched.group(1), 16)
    row = re.search(r'^EVF_MISS address changed held: ([^\r\n]*)', text, re.M)
    if row:
        values = row.group(1).split()
        if len(values) != 3 or any(not re.fullmatch(r'[0-9a-fA-F]{8}', v) for v in values):
            raise ValueError('Malformed EVF miss counters')
        result['EVF_MISS'] = dict(zip(('address_only', 'other_change', 'held_previous'), (int(v, 16) for v in values)))
    elif state['on'] and has_latched_rows:
        raise ValueError('Missing EVF miss counters')
    active_names = ['samples', *REGS[:13], 'IMG2DMASADR', 'IMG2DMALD', 'IMG2DMABN',
                    'IMG2FMT', 'IMG2AREA1', 'IMG2AREA2', *(f'IMG2RSZ{i}' for i in range(1, 7)),
                    'IMG2PLANC', 'VIDEOAREA1', 'VIDEOAREA2', 'LATCHED_DMAEN']
    for prefix in ('EVF_PRE', 'EVF_POST', 'TFT_PRE', 'TFT_POST'):
        line = next((s for s in text.splitlines() if s.startswith(prefix + ' active: ')), None)
        if line is None:
            if ('screen test 4 continuity' in text or 'screen test 5' in text or 'screen test 6' in text or has_latched_rows) and state['on']:
                raise ValueError('Missing active display row: ' + prefix)
            continue
        fields = line.split(':', 1)[1].split()
        names = active_names + (['SYNC1', 'SYNC4'] if len(fields) in (len(active_names) + 2, len(active_names) + 4, len(active_names) + 9) else [])
        if len(fields) in (len(active_names) + 4, len(active_names) + 9):
            names += ['IMG1AREA3', 'IMG2AREA3']
        if len(fields) == len(active_names) + 9:
            names += ['LATCHED_' + reg for reg in ('IMG2DMASADR', 'IMG2DMALD', 'IMG2AREA1', 'IMG2AREA2', 'IMG2AREA3')]
        if has_latched_rows and 'LATCHED_IMG2AREA3' not in names:
            raise ValueError('Missing latched descriptor: ' + prefix)
        if 'screen test 6' in text and 'IMG2AREA3' not in names:
            raise ValueError('Missing field origins: ' + prefix)
        if 'screen test 5' in text and len(names) == len(active_names):
            raise ValueError('Missing scan-mode fields: ' + prefix)
        if len(fields) != len(names) or any(not re.fullmatch(r'[0-9a-fA-F]{8}', s) for s in fields):
            raise ValueError('Malformed active display row: ' + prefix)
        result[prefix] = dict(zip(names, (int(s, 16) for s in fields)))
    observations = []
    if state['on'] != 1:
        observations.append('Feature is not armed; inspect marker/card check and installed build.')
    else:
        evf = result.get('EVF_POST', {})
        if evf.get('samples') and 'SYNC1' in evf:
            progressive = bool(evf['SYNC1'] & (1 << 24)) and (evf['SYNC4'] & 0x7fff) == 0
            observations.append(
                'Active EVF scan timing matches the emulator progressive-mode check.' if progressive else
                'Active EVF scan timing is outside progressive mode; inspect the per-field origins and heights.'
            )
        if counts['update'] == 0:
            observations.append('No histogram-update hook observed after arming.')
        if counts['gate']:
            observations.append('Latest gate rejected: ' + {2: 'photo switch', 3: 'GUI state'}.get(counts['gate'], 'unknown'))
        if counts['capN'] and counts['cap']:
            observations.append('Latest capture rejected: ' + REASONS.get(counts['why'], 'unknown reason'))
        if counts['pubN'] and counts['pub']:
            observations.append('Latest publish rejected: ' + {1: 'IMG2 busy or invalid channel', 2: 'ownership lost'}.get(counts['pub'], 'unknown'))
        if state['frames']:
            observations.append('At least one publish succeeded; this does not prove it was visible on the camera.')
        if counts['cancel']:
            observations.append('At least one in-flight frame was canceled by reconfiguration or a changed gate.')
    result['observations'] = observations
    return result


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('log', type=Path)
    ap.add_argument('--out', type=Path)
    args = ap.parse_args()
    value = json.dumps(decode(args.log.read_bytes().decode('latin1')), indent=2)
    if args.out:
        args.out.write_text(value + '\n')
    print(value)
