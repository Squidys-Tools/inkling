param(
    [string] $OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.artifacts\inkling-preview-win'),
    [string] $CacheDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.artifacts\native-preview-cache')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$cacheDirectory = [IO.Path]::GetFullPath($CacheDirectory)
$repoPrefix = ([IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\')

if (-not $outputDirectory.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must stay inside the repository artifacts directory: $outputDirectory"
}

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

function Copy-ManifestAsset($Model, $Asset, [string] $ModelsDirectory, [string] $ModelCacheDirectory) {
    $relativePath = ($Asset.path -replace '/', '\').TrimStart('\')
    if ([IO.Path]::IsPathRooted($Asset.path) -or $relativePath -match '(^|\\)\.\.(\\|$)') {
        throw "Model manifest contains an unsafe asset path: $($Asset.path)"
    }

    $modelCache = Join-Path $ModelCacheDirectory $Model.name
    $cachedAsset = Join-Path $modelCache $relativePath
    Get-VerifiedDownload $Asset.url $cachedAsset $Asset.sha256

    $stagedAsset = Join-Path (Join-Path $ModelsDirectory $Model.name) $relativePath
    Ensure-Directory (Split-Path -Parent $stagedAsset)
    Copy-Item -LiteralPath $cachedAsset -Destination $stagedAsset -Force
}

Push-Location $repoRoot
$temporaryBuildOrt = $false
try {
    $manifest = Get-Content -Raw -LiteralPath 'src-tauri\model-manifest.json' | ConvertFrom-Json
    $runtime = Get-Content -Raw -LiteralPath 'scripts\native-preview-runtime.json' | ConvertFrom-Json

    if (Test-Path -LiteralPath $outputDirectory) {
        Remove-Item -LiteralPath $outputDirectory -Recurse -Force
    }
    Ensure-Directory $outputDirectory
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
    if ((Get-Sha256 $runtimeDll) -ne $runtime.dllSha256.ToLowerInvariant()) {
        throw "SHA-256 mismatch for the staged ONNX Runtime DLL"
    }

    $modelsDirectory = Join-Path $outputDirectory 'data\models'
    Copy-ManifestAsset $manifest.text $manifest.text.model $modelsDirectory (Join-Path $cacheDirectory 'models')
    Copy-ManifestAsset $manifest.text $manifest.text.tokenizer $modelsDirectory (Join-Path $cacheDirectory 'models')
    Copy-ManifestAsset $manifest.image $manifest.image.model $modelsDirectory (Join-Path $cacheDirectory 'models')

    $buildOrt = Join-Path $repoRoot 'src-tauri\onnxruntime.dll'
    if (-not (Test-Path -LiteralPath $buildOrt)) {
        Copy-Item -LiteralPath $runtimeDll -Destination $buildOrt
        $temporaryBuildOrt = $true
    }
    try {
        & bun tauri build --no-bundle --config src-tauri\tauri.preview.conf.json
        if ($LASTEXITCODE -ne 0) {
            throw "Tauri preview build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        if ($temporaryBuildOrt -and (Test-Path -LiteralPath $buildOrt)) {
            Remove-Item -LiteralPath $buildOrt -Force
        }
    }

    $builtExecutable = Join-Path $repoRoot 'src-tauri\target\release\inkling.exe'
    if (-not (Test-Path -LiteralPath $builtExecutable)) {
        throw "Expected native executable was not produced: $builtExecutable"
    }
    Copy-Item -LiteralPath $builtExecutable -Destination (Join-Path $outputDirectory 'inkling.exe')
    Copy-Item -LiteralPath $runtimeDll -Destination (Join-Path $outputDirectory 'onnxruntime.dll') -Force

    $webViewLoader = Join-Path $repoRoot 'src-tauri\target\release\WebView2Loader.dll'
    if (Test-Path -LiteralPath $webViewLoader) {
        Copy-Item -LiteralPath $webViewLoader -Destination (Join-Path $outputDirectory 'WebView2Loader.dll') -Force
    }

    Set-Content -LiteralPath (Join-Path $outputDirectory 'portable.flag') -Value 'inkling portable preview' -NoNewline
    Set-Content -LiteralPath (Join-Path $outputDirectory 'README.txt') -Value @'
inkling Windows preview

Run inkling.exe from this folder. This is a portable review build, not an installer.
The app stores its database, saved assets, and embedding models under data\.
The model files were downloaded and SHA-256 verified while this folder was built.

WebView2 is expected to be installed on Windows. Delete this entire folder to
remove the preview library, assets, and model files.
'@

    Write-Host "Portable preview created at $outputDirectory"
    Write-Output $outputDirectory
}
finally {
    Pop-Location
}
