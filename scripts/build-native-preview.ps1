param(
    [string] $OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.artifacts\inkling-preview-win'),
    [string] $CacheDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.artifacts\native-preview-cache')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$cacheDirectory = [IO.Path]::GetFullPath($CacheDirectory)
$buildOrt = [IO.Path]::GetFullPath((Join-Path $repoRoot 'src-tauri\onnxruntime.dll'))
$repoPrefix = ([IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\')

if (-not $outputDirectory.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must stay inside the repository artifacts directory: $outputDirectory"
}

. (Join-Path $PSScriptRoot 'verified-download.ps1')

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

    if (Test-Path -LiteralPath $outputDirectory) {
        Remove-Item -LiteralPath $outputDirectory -Recurse -Force
    }
    Ensure-Directory $outputDirectory
    Ensure-Directory $cacheDirectory

    # The provisioner owns the pinned runtime and the download cache, and
    # returns the path it wrote to. Stage our own copy of the DLL in the output
    # folder now, because the provisioner's copy is removed after the build and
    # the portable folder has to survive on its own.
    $hadBuildOrt = Test-Path -LiteralPath $buildOrt
    $runtimeDll = & (Join-Path $PSScriptRoot 'provision-onnxruntime.ps1') -CacheDirectory $cacheDirectory -Destination $buildOrt
    $temporaryBuildOrt = -not $hadBuildOrt
    Copy-Item -LiteralPath $runtimeDll -Destination (Join-Path $outputDirectory 'onnxruntime.dll') -Force

    $modelsDirectory = Join-Path $outputDirectory 'data\models'
    Copy-ManifestAsset $manifest.text $manifest.text.model $modelsDirectory (Join-Path $cacheDirectory 'models')
    Copy-ManifestAsset $manifest.text $manifest.text.tokenizer $modelsDirectory (Join-Path $cacheDirectory 'models')
    Copy-ManifestAsset $manifest.image $manifest.image.model $modelsDirectory (Join-Path $cacheDirectory 'models')

    $targetDirectory = Join-Path $repoRoot 'src-tauri\target'
    $releaseDirectory = Join-Path $targetDirectory 'release'
    $previousTargetDirectory = $env:CARGO_TARGET_DIR
    try {
        $env:CARGO_TARGET_DIR = $targetDirectory
        & bun tauri build --no-bundle --features portable-preview --config src-tauri\tauri.preview.conf.json
        if ($LASTEXITCODE -ne 0) {
            throw "Tauri preview build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        $env:CARGO_TARGET_DIR = $previousTargetDirectory
        if ($temporaryBuildOrt -and (Test-Path -LiteralPath $buildOrt)) {
            Remove-Item -LiteralPath $buildOrt -Force
        }
    }

    $builtExecutable = Join-Path $releaseDirectory 'inkling.exe'
    if (-not (Test-Path -LiteralPath $builtExecutable)) {
        throw "Expected native executable was not produced: $builtExecutable"
    }
    Copy-Item -LiteralPath $builtExecutable -Destination (Join-Path $outputDirectory 'inkling.exe')

    $webViewLoader = Join-Path $releaseDirectory 'WebView2Loader.dll'
    if (Test-Path -LiteralPath $webViewLoader) {
        Copy-Item -LiteralPath $webViewLoader -Destination (Join-Path $outputDirectory 'WebView2Loader.dll') -Force
    }

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
