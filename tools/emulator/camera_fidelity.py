"""Apply/check our versioned camera-evidence overlay on the pinned OM-Emu.

Does not reset, overwrite unrelated changes, fetch or change the upstream pin.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent


def verify(root, apply=False):
    manifest = json.loads((HERE / 'camera-fidelity.json').read_text())
    patch = HERE / 'camera-fidelity.patch'
    sha = lambda data: hashlib.sha256(data).hexdigest()
    if sha(patch.read_bytes()) != manifest['patch_sha256']:
        raise ValueError('Camera fidelity patch checksum mismatch')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if head != manifest['base']:
        raise ValueError('Camera fidelity overlay needs its recorded base commit; review before rebasing')
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=root, text=True).splitlines()
    unexpected = set(changed) - set(manifest['files'])
    if unexpected:
        raise ValueError('Unrecorded emulator edits: ' + ', '.join(sorted(unexpected)))
    def matches(which):
        return all((sha((root / f).read_bytes().replace(b'\r\n', b'\n')) if (root / f).exists() else None) == h[which]
                   for f, h in manifest['files'].items())
    if matches('after'):
        return manifest['patch_sha256']
    if not apply:
        raise ValueError('Camera fidelity overlay missing/changed: run tools/emulator/camera_fidelity.py EMU_ROOT --apply')
    if not matches('before'):
        raise ValueError('Existing emulator edits differ from the overlay; refusing to overwrite')
    subprocess.run(['git', 'apply', '--check', str(patch)], cwd=root, check=True)
    subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
    if not matches('after'):
        raise ValueError('Applied overlay checksum mismatch')
    return manifest['patch_sha256']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('emulator', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print('camera fidelity overlay:', verify(args.emulator.resolve(), args.apply))
