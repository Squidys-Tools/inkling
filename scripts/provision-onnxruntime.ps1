# Puts the pinned ONNX Runtime DLL where tauri-build expects it, so any Windows
# build can bundle it. `ort` is compiled with `load-dynamic` and
# `tauri.conf.json` lists the DLL under `bundle.resources`, so the file has to
# exist before the bundle step or tauri-build rejects the resources entry.
#
# Writes the resolved DLL path to stdout for callers to reuse. The downloaded
# archive is cached under `.artifacts/`, outside the repo.
param(
    [string] $CacheDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.artifacts\onnxruntime-cache'),
    [string] $Destination = (Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri\onnxruntime.dll')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'verified-download.ps1')

$cacheDirectory = [IO.Path]::GetFullPath($CacheDirectory)
$destination = [IO.Path]::GetFullPath($Destination)
$runtime = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'native-preview-runtime.json') | ConvertFrom-Json

# A pre-existing DLL is trusted only when it matches the pin. Overwriting a
# maintainer's file silently would hide a genuinely stale runtime.
if (Test-Path -LiteralPath $destination) {
    if ((Get-Sha256 $destination) -ne $runtime.dllSha256.ToLowerInvariant()) {
        throw "$destination is not the pinned ONNX Runtime $($runtime.version) build. Delete it to re-provision."
    }
    Write-Output $destination
    return
}

Ensure-Directory $cacheDirectory
$runtimeZip = Join-Path $cacheDirectory "onnxruntime-win-x64-$($runtime.version).zip"
Get-VerifiedDownload $runtime.url $runtimeZip $runtime.sha256

$runtimeExtract = Join-Path $cacheDirectory "onnxruntime-win-x64-$($runtime.version)"
$runtimeDll = Get-ChildItem -LiteralPath $runtimeExtract -Filter 'onnxruntime.dll' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $runtimeDll) {
    Ensure-Directory $runtimeExtract
    Expand-Archive -LiteralPath $runtimeZip -DestinationPath $runtimeExtract
    $runtimeDll = Get-ChildItem -LiteralPath $runtimeExtract -Filter 'onnxruntime.dll' -Recurse | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $runtimeDll) {
    throw "The ONNX Runtime $($runtime.version) archive did not contain onnxruntime.dll"
}
if ((Get-Sha256 $runtimeDll) -ne $runtime.dllSha256.ToLowerInvariant()) {
    throw "SHA-256 mismatch for the staged ONNX Runtime DLL"
}

Ensure-Directory (Split-Path -Parent $destination)
Copy-Item -LiteralPath $runtimeDll -Destination $destination -Force
Write-Host "Provisioned ONNX Runtime $($runtime.version) at $destination"

Write-Output $destination
