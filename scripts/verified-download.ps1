# Shared helpers for the pinned downloads the Windows builds depend on.
# Dot-sourced by scripts/provision-onnxruntime.ps1 and
# scripts/build-native-preview.ps1 so the hash checking lives in one place.

function Ensure-Directory([string] $Path) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Get-Sha256([string] $Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        -join ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') })
    }
    finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Get-VerifiedDownload([string] $Url, [string] $Path, [string] $ExpectedHash) {
    $parent = Split-Path -Parent $Path
    Ensure-Directory $parent

    if (Test-Path -LiteralPath $Path) {
        if ((Get-Sha256 $Path) -eq $ExpectedHash.ToLowerInvariant()) {
            return
        }
        Remove-Item -LiteralPath $Path -Force
    }

    $partial = "$Path.part"
    Write-Host "Downloading $Url"
    & curl.exe --fail --location --silent --show-error --output $partial $Url
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
        throw "Download failed for $Url"
    }
    if ((Get-Sha256 $partial) -ne $ExpectedHash.ToLowerInvariant()) {
        Remove-Item -LiteralPath $partial -Force
        throw "SHA-256 mismatch for $Url"
    }
    Move-Item -LiteralPath $partial -Destination $Path
}
