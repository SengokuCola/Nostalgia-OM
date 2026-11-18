import hashlib, subprocess
from pathlib import Path

# Keep in sync with the repo dirs firmware/build.py reads.
SOURCE_DIRS = ('firmware', 'card')
SKIP_DIR_NAMES = {'__pycache__'}
SKIP_SUFFIXES = {'.pyc'}


def git_files(repo: Path):
    """Tracked and untracked files, gitignored ones left out, so build outputs under firmware/ do not count.
    None outside a git checkout."""
    try:
        r = subprocess.run(['git', 'ls-files', '-z', '-co', '--exclude-standard', '--', *SOURCE_DIRS],
                           cwd=repo, capture_output=True)
    except OSError:
        return None
    if r.returncode or not (repo / '.git').exists():
        return None
    return [repo / n for n in r.stdout.decode().split('\0') if n and (repo / n).is_file()]


def source_files(repo: Path):
    repo = Path(repo)
    files = git_files(repo)
    if files is None:
        files = [p for d in SOURCE_DIRS for p in (repo / d).rglob('*') if p.is_file()]
    files = [p for p in files
             if not SKIP_DIR_NAMES & set(p.relative_to(repo).parts) and p.suffix not in SKIP_SUFFIXES]
    return sorted(files, key=lambda p: p.relative_to(repo).as_posix())


def source_digest(repo: Path) -> str:
    repo = Path(repo)
    h = hashlib.sha256()
    for p in source_files(repo):
        h.update(p.relative_to(repo).as_posix().encode() + b'\0')
        h.update(hashlib.sha256(p.read_bytes()).digest())
    return h.hexdigest()
