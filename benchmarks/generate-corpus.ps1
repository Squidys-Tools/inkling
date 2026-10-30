#Requires -Version 7
# Generates the inkling benchmark corpus (images, screenshots, PDFs).
#
# Every file produced by this script is original and generated locally with
# .NET System.Drawing. Nothing is downloaded and nothing is copyrighted.
# Run from the repository root or from anywhere; output lands under
# benchmarks/corpus. Re-running is safe (idempotent overwrites).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Corpus = Join-Path $Root 'corpus'
$ImgDir = Join-Path $Corpus 'images'
$ScrDir = Join-Path $Corpus 'screenshots'
$PdfDir = Join-Path $Corpus 'pdfs'
$OcrExpDir = Join-Path $Root 'expected/ocr'

foreach ($dir in @($ImgDir, $ScrDir, $PdfDir, $OcrExpDir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

. (Join-Path $Root 'corpus-generator/drawing.ps1')
. (Join-Path $Root 'corpus-generator/images.ps1')
. (Join-Path $Root 'corpus-generator/text-images.ps1')
. (Join-Path $Root 'corpus-generator/screenshots.ps1')
. (Join-Path $Root 'corpus-generator/pdf-writer.ps1')
. (Join-Path $Root 'corpus-generator/pdfs.ps1')

Write-Photo
Write-DesignRef
Write-SimilarA
Write-SimilarB
Write-Distractor
Write-LowRes
Write-Meme
Write-Handwriting
Write-RotatedText
Write-Columns
Write-ScreenshotLargeText
Write-ScreenshotSmallText
Write-NativeTextPdf
Write-ScannedPdf
Write-MulticolumnPdf
Write-TablesPdf
Write-PdfImagesCaptions
Write-BadMetadataPdf

Write-Host 'Corpus generation complete.'
