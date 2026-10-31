"""Verify a private staged update before the OS package manager sees it."""
import base64
import hashlib
import hmac
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from contextlib import contextmanager

MAX_BYTES = 1024 * 1024 * 1024
ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8", "HOME": "/root"}


def trusted_helper():
    path = Path(__file__)
    if str(path) != "/opt/inkling/resources/update-helper.py":
        raise ValueError("The installed update helper is required.")
    for entry in [path, *path.parents]:
        info = entry.lstat()
        if info.st_uid != 0 or info.st_mode & 0o022 or stat.S_ISLNK(info.st_mode):
            raise ValueError("The installed update helper is not protected.")


@contextmanager
def verified_copy(source, expected_sha512, version, staging_parent=None):
    expected = base64.b64decode(expected_sha512, validate=True)
    if len(expected) != 64 or not re.fullmatch(r"\d+\.\d+\.\d+(?:-nightly\.\d{8}\.\d+)?", version):
        raise ValueError("Invalid update identity.")
    if not os.path.isabs(source):
        raise ValueError("An absolute update path is required.")
    folder = Path(tempfile.mkdtemp(prefix="inkling-update-", dir=staging_parent))
    try:
        os.chmod(folder, 0o700)
        staged = folder / "update.deb"
        fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as incoming:
            info = os.fstat(incoming.fileno())
            if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_BYTES:
                raise ValueError("Invalid update file.")
            digest = hashlib.sha512()
            total = 0
            with staged.open("xb") as output:
                os.chmod(staged, 0o600)
                while chunk := incoming.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise ValueError("Update exceeds its size limit.")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
        if not hmac.compare_digest(digest.digest(), expected):
            raise ValueError("The update changed after download.")
        result = subprocess.run(
            ["/usr/bin/dpkg-deb", "--field", str(staged), "Package", "Version", "Architecture"],
            check=True, capture_output=True, text=True, timeout=30, env=ENV,
        )
        fields = dict(line.split(": ", 1) for line in result.stdout.strip().splitlines())
        arch = subprocess.run(["/usr/bin/dpkg", "--print-architecture"], check=True,
                              capture_output=True, text=True, timeout=10, env=ENV).stdout.strip()
        if (fields.get("Package") != "inkling" or fields.get("Version") != version.replace("-", "~")
                or fields.get("Architecture") not in (arch, "all")):
            raise ValueError("The update package identity does not match.")
        yield staged
    finally:
        shutil.rmtree(folder)


def main():
    if len(sys.argv) != 4 or os.geteuid() != 0:
        raise ValueError("Use the installed app and the system authorization prompt.")
    trusted_helper()
    # The private root-owned copy, not the user's mutable cache path, crosses into dpkg.
    with verified_copy(*sys.argv[1:], staging_parent="/var/tmp") as staged:
        subprocess.run(["/usr/bin/dpkg", "--install", str(staged)], check=True,
                       stdin=subprocess.DEVNULL, timeout=240, env=ENV)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Update verification or installation failed. Nothing is reported as installed.", file=sys.stderr)
        sys.exit(1)
