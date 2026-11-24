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
    def file_hash(f):
        path = root / f
        return sha(path.read_bytes().replace(b'\r\n', b'\n')) if path.exists() else None

    pending = []
    for f, hashes in manifest['files'].items():
        current = file_hash(f)
        if current == hashes['after']:
            continue
        if current != hashes['before']:
            raise ValueError(f'Unexpected emulator edits in {f}; refusing to overwrite')
        pending.append(f)
    if not pending:
        return manifest['patch_sha256']
    if not apply:
        raise ValueError('Camera fidelity overlay missing: run tools/emulator/camera_fidelity.py EMU_ROOT --apply')
    # Previously installed, verified files need no second application.
    includes = [f'--include={f}' for f in pending]
    subprocess.run(['git', 'apply', '--check', *includes, str(patch)], cwd=root, check=True)
    subprocess.run(['git', 'apply', *includes, str(patch)], cwd=root, check=True)
    if any(file_hash(f) != h['after'] for f, h in manifest['files'].items()):
        raise ValueError('Applied overlay checksum mismatch')
    return manifest['patch_sha256']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('emulator', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print('camera fidelity overlay:', verify(args.emulator.resolve(), args.apply))
