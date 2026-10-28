import base64
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("inkling_update_helper", Path(__file__).resolve().parents[1] / "electron/update-helper.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class UpdateCopyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="inkling-helper-test-")
        self.root = Path(self.temporary.name)
        self.package = self.root / "update.deb"
        control = self.root / "package/DEBIAN"
        control.mkdir(parents=True)
        arch = subprocess.check_output(["/usr/bin/dpkg", "--print-architecture"], text=True).strip()
        (control / "control").write_text(f"Package: inkling\nVersion: 0.2.0~nightly.20261028.1\nArchitecture: {arch}\nMaintainer: inkling tests\nDescription: Verification fixture only\n")
        subprocess.run(["/usr/bin/dpkg-deb", "--build", "--root-owner-group", str(control.parent), str(self.package)], check=True, capture_output=True)
        self.original = self.package.read_bytes()
        self.digest = base64.b64encode(hashlib.sha512(self.original).digest()).decode()
        self.version = "0.2.0-nightly.20261028.1"

    def tearDown(self):
        self.temporary.cleanup()

    def test_stage_uses_private_verified_copy_after_source_replacement(self):
        with helper.verified_copy(str(self.package), self.digest, self.version, self.root) as staged:
            self.assertEqual(staged.read_bytes(), self.original)
            self.assertEqual(staged.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(staged.stat().st_mode & 0o777, 0o600)
            self.package.write_bytes(b"swap while installation is pending")
            self.assertEqual(staged.read_bytes(), self.original)
            folder = staged.parent
        self.assertFalse(folder.exists())

    def test_swap_during_consent_or_auth_is_rejected_before_manager(self):
        self.package.write_bytes(b"swapped while consent or authorization is pending")
        with self.assertRaisesRegex(ValueError, "changed"):
            with helper.verified_copy(str(self.package), self.digest, self.version, self.root):
                self.fail("Changed bytes reached the manager boundary")

    def test_digest_identity_symlink_and_oversize_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "identity"):
            with helper.verified_copy(str(self.package), self.digest, "0.2.1", self.root):
                self.fail("wrong package version")
        link = self.root / "link.deb"
        link.symlink_to(self.package)
        with self.assertRaises(OSError):
            with helper.verified_copy(str(link), self.digest, self.version, self.root):
                self.fail("symlink")
        with self.package.open("wb") as file:
            file.truncate(helper.MAX_BYTES + 1)
        with self.assertRaisesRegex(ValueError, "Invalid update file"):
            with helper.verified_copy(str(self.package), self.digest, self.version, self.root):
                self.fail("oversized file")
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["link.deb", "package", "update.deb"])

    def test_uninstalled_helper_cannot_install(self):
        with self.assertRaisesRegex(ValueError, "installed"):
            helper.trusted_helper()


if __name__ == "__main__":
    unittest.main()
