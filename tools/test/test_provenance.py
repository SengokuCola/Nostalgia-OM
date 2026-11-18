import shutil, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "firmware"))
from provenance import source_digest, source_files

REPO = Path(__file__).resolve().parents[2]
CHANGED_FILE = Path('firmware') / 'VERSION'


class SourceDigest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        for p in source_files(REPO):
            dest = self.tmp / p.relative_to(REPO)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)

    def test_stable(self):
        self.assertEqual(source_digest(self.tmp), source_digest(self.tmp))

    def test_matches_real_checkout(self):
        self.assertEqual(source_digest(self.tmp), source_digest(REPO))

    def test_changes_with_firmware_file(self):
        before = source_digest(self.tmp)
        with open(self.tmp / CHANGED_FILE, 'ab') as f:
            f.write(b'x')
        self.assertNotEqual(before, source_digest(self.tmp))

    def test_ignores_pycache(self):
        before = source_digest(self.tmp)
        cache = self.tmp / 'firmware' / '__pycache__'
        cache.mkdir()
        (cache / 'build.cpython-312.pyc').write_bytes(b'junk')
        (self.tmp / 'card' / 'stray.pyc').write_bytes(b'junk')
        self.assertEqual(before, source_digest(self.tmp))

    def test_ignores_gitignored_build_output(self):
        before = source_digest(REPO)
        out = Path(tempfile.mkdtemp(prefix='out-test-', dir=REPO / 'firmware'))
        self.addCleanup(shutil.rmtree, out, ignore_errors=True)
        (out / 'main.bin').write_bytes(b'junk')
        self.assertEqual(before, source_digest(REPO))


if __name__ == '__main__':
    unittest.main()
