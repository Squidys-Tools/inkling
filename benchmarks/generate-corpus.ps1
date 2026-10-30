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
$ArtDir = Join-Path $Corpus 'articles'
$VidDir = Join-Path $Corpus 'videos'
$NoteDir = Join-Path $Corpus 'notes'
$ExpDir = Join-Path $Root 'expected'
$OcrExpDir = Join-Path $ExpDir 'ocr'

foreach ($dir in @($Corpus, $ImgDir, $ScrDir, $PdfDir, $ArtDir, $VidDir, $NoteDir, $ExpDir, $OcrExpDir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

. (Join-Path $Root 'corpus-generator/drawing.ps1')
. (Join-Path $Root 'corpus-generator/images.ps1')
. (Join-Path $Root 'corpus-generator/text-images.ps1')
. (Join-Path $Root 'corpus-generator/screenshots.ps1')

# ------------------------------------------------------------- pdfs ----

function New-Pdf {
    param(
        [string]$Path,
        [string]$PageStream,
        [byte[]]$Jpeg = $null,
        [int]$ImgW = 0,
        [int]$ImgH = 0
    )

    $ascii = [System.Text.Encoding]::ASCII
    $objects = [System.Collections.Generic.List[byte[]]]::new()

    $pageResources = '/Resources << /Font << /F1 5 0 R >>'
    if ($null -ne $Jpeg) { $pageResources += ' /XObject << /Im0 6 0 R >>' }
    $pageResources += ' >>'

    $objects.Add($ascii.GetBytes('<< /Type /Catalog /Pages 2 0 R >>'))
    $objects.Add($ascii.GetBytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
    $objects.Add($ascii.GetBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] $pageResources /Contents 4 0 R >>"))

    $streamText = '<< /Length ' + $ascii.GetByteCount($PageStream) + " >>`nstream`n" + $PageStream + "endstream"
    $objects.Add($ascii.GetBytes($streamText))
    $objects.Add($ascii.GetBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'))

    if ($null -ne $Jpeg) {
        $imgHead = '<< /Type /XObject /Subtype /Image /Width ' + $ImgW + ' /Height ' + $ImgH +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + $Jpeg.Length + " >>`nstream`n"
        $imgBytes = [System.Collections.Generic.List[byte]]::new()
        $imgBytes.AddRange($ascii.GetBytes($imgHead))
        $imgBytes.AddRange($Jpeg)
        $imgBytes.AddRange($ascii.GetBytes("`r`nendstream"))
        $objects.Add($imgBytes.ToArray())
    }

    $count = $objects.Count + 1
    $out = [System.Collections.Generic.List[byte]]::new()
    $out.AddRange($ascii.GetBytes("%PDF-1.4`n"))

    $offsets = [System.Collections.Generic.List[int]]::new()
    for ($i = 0; $i -lt $objects.Count; $i++) {
        $offsets.Add($out.Count)
        $out.AddRange($ascii.GetBytes(($i + 1).ToString() + ' 0 obj' + "`n"))
        $out.AddRange($objects[$i])
        $out.AddRange($ascii.GetBytes("`nendobj`n"))
    }

    $xrefOffset = $out.Count
    $out.AddRange($ascii.GetBytes("xref`r`n0 $count`r`n"))
    $out.AddRange($ascii.GetBytes('0000000000 65535 f' + "`r`n"))
    for ($i = 0; $i -lt $offsets.Count; $i++) {
        $out.AddRange($ascii.GetBytes($offsets[$i].ToString('D10') + ' 00000 n' + "`r`n"))
    }
    $out.AddRange($ascii.GetBytes("trailer`r`n<< /Size $count /Root 1 0 R >>`r`nstartxref`r`n$xrefOffset`r`n%%EOF"))

    [System.IO.File]::WriteAllBytes($Path, $out.ToArray())
}

function Escape-PdfText {
    param([string]$Text)
    $Text.Replace('\', '\\').Replace('(', '\(').Replace(')', '\)')
}

function Pdf-Line {
    param([string]$Text, [single]$Size, [single]$X, [single]$Y, [string]$Font = 'F1')
    'BT /' + $Font + ' ' + $Size.ToString('F0') + ' Tf 1 0 0 1 ' + $X.ToString('F0') + ' ' + $Y.ToString('F0') + ' Tm (' + (Escape-PdfText $Text) + ') Tj ET'
}

function Write-NativeTextPdf {
    $lines = @()
    $lines += Pdf-Line 'A Field Guide to Local First Software' 22 72 730
    $lines += Pdf-Line 'by the inkling benchmark team' 12 72 706
    $lines += ''
    $lines += Pdf-Line '1. Introduction' 16 72 660
    $lines += Pdf-Line 'Local first means your data lives on your device and works' 12 72 640
    $lines += Pdf-Line 'without a connection. Your library is a database and a folder' 12 72 626
    $lines += Pdf-Line 'of files, not a remote account.' 12 72 612
    $lines += ''
    $lines += Pdf-Line '2. The Capture Rule' 16 72 576
    $lines += Pdf-Line 'Saving must be faster than deciding where something belongs.' 12 72 556
    $lines += Pdf-Line 'If a note takes three taps to make, people will not take notes.' 12 72 542
    $lines += ''
    $lines += Pdf-Line '3. The Retrieval Promise' 16 72 506
    $lines += Pdf-Line 'Search is the primary organizing system. Tags and folders are' 12 72 486
    $lines += Pdf-Line 'optional furniture; the index is the floor plan.' 12 72 472
    $lines += ''
    $lines += Pdf-Line '4. Closing' 16 72 436
    $lines += Pdf-Line 'Keep it quiet, keep it local, and let the index do the work.' 12 72 416
    $lines += Pdf-Line 'End of field guide.' 12 72 402

    New-Pdf (Join-Path $PdfDir 'pdf-native-text-01.pdf') (($lines -join "`n") + "`n")
}

$memorandum = @(
    'MEMORANDUM',
    '',
    'TO:        All Hands',
    'FROM:      Operations',
    'DATE:      March 12, 2026',
    'RE:        Quarterly Inventory and the Persistent Ghosts of Spring',
    '',
    'Dear team,',
    '',
    'The warehouse count finished at 14,207 units, which is 112 more',
    'than the system predicted. The discrepancy traces back to the west',
    'rack, where boxes are stacked by hand and the barcode scanner gives',
    'up on dust. We will rescan that rack on Friday and credit the',
    'difference.',
    '',
    'The second item is more unusual. Two crates labeled "sprouted',
    'bulbs" have started to germinate in the loading bay. No one ordered',
    'bulbs. No one remembers ordering bulbs. The crates arrived with a',
    'packing slip that reads only: "You know what these are for."',
    '',
    'We are scheduling a meeting to discuss the bulbs.',
    '',
    'Signed,',
    'Operations'
)

function Write-ScannedPdf {
    # Render a typewriter-style page, save as JPEG, embed as a scanned PDF.
    $margin = 150
    $startY = 180
    $lineHeight = 62
    $font = New-Font 'Courier New' 34

    # Size the canvas to fit the widest line so the right edge is never clipped.
    $temp = New-Canvas 1 1 (C 250 247 240)
    $gTemp = $temp[1]
    $maxWidth = 0
    foreach ($lineText in $memorandum) {
        if (-not $lineText) { continue }
        $width = $gTemp.MeasureString($lineText, $font).Width
        if ($width -gt $maxWidth) { $maxWidth = $width }
    }
    Dispose-Canvas $temp

    $W = [int][Math]::Ceiling($maxWidth) + 2 * $margin
    $H = $startY + $memorandum.Count * $lineHeight + $margin
    $canvas = New-Canvas $W $H (C 250 247 240)
    $g = $canvas[1]

    $ink = Brush (C 30 40 50)
    $y = $startY
    foreach ($lineText in $memorandum) {
        $g.DrawString($lineText, $font, $ink, $margin, $y)
        $y += $lineHeight
    }
    $font.Dispose()

    $tmpJpeg = Join-Path $PdfDir '_scanned-page-01.tmp.jpg'
    Save-Jpeg $canvas[0] $tmpJpeg 85
    $jpegBytes = [System.IO.File]::ReadAllBytes($tmpJpeg)
    Dispose-Canvas $canvas

    New-Pdf (Join-Path $PdfDir 'pdf-scanned-01.pdf') ("q`n612 0 0 792 0 0 cm`n/Im0 Do`nQ`n") $jpegBytes $W $H
    Remove-Item $tmpJpeg -Force

    Write-ExpectedOcr 'pdf-scanned-01' ($memorandum -join "`n")
}

function Wrap-PdfColumns {
    param([string]$Text)
    $lines = @()
    $current = ''
    foreach ($w in ($Text -split ' ')) {
        if (($current + ' ' + $w).Trim().Length -le 55) {
            $current = ($current + ' ' + $w).Trim()
        } else {
            $lines += $current
            $current = $w
        }
    }
    if ($current) { $lines += $current }
    return $lines
}

function Write-MulticolumnPdf {
    $left = 'The first column opens with a question that has no tidy answer, so it keeps going instead. Newspapers were built this way: two thoughts side by side, each pretending the other does not exist. Column geometry is a social contract between the author and the margin.'
    $right = 'The second column is shorter on purpose. It prefers a rumor to a paragraph and a margin note to a chapter. A magazine trusts its readers the way a deck trusts its railings: enough to lean, never enough to leave.'

    $lines = @()
    $lines += Pdf-Line 'Field Notes - Two Columns' 20 72 750
    $lines += ''

    $linesL = Wrap-PdfColumns $left
    $linesR = Wrap-PdfColumns $right

    $max = [Math]::Max($linesL.Count, $linesR.Count)
    for ($i = 0; $i -lt $max; $i++) {
        $y = 700 - $i * 18
        if ($i -lt $linesL.Count) { $lines += Pdf-Line $linesL[$i] 12 72 $y }
        if ($i -lt $linesR.Count) { $lines += Pdf-Line $linesR[$i] 12 330 $y }
    }

    New-Pdf (Join-Path $PdfDir 'pdf-multicolumn-01.pdf') (($lines -join "`n") + "`n")
}

function Write-TablesPdf {
    $rows = @(
        @{ Quarter = 'Q1'; Revenue = '28,400'; Expenses = '19,700'; Notes = 'flat' },
        @{ Quarter = 'Q2'; Revenue = '31,150'; Expenses = '21,300'; Notes = 'grew' },
        @{ Quarter = 'Q3'; Revenue = '29,900'; Expenses = '22,100'; Notes = 'dipped' },
        @{ Quarter = 'Q4'; Revenue = '34,600'; Expenses = '23,400'; Notes = 'best' }
    )

    $lines = @()
    $lines += Pdf-Line 'Quarterly Operating Summary' 20 72 750
    $lines += Pdf-Line 'All figures in local currency, unaudited.' 10 72 730
    $lines += ''

    $left = 90; $w1 = 110; $w2 = 140; $w3 = 140; $w4 = 120
    $totalW = $w1 + $w2 + $w3 + $w4
    $rowY = 690; $rowH = 30
    $headers = @(@{ T = 'Quarter'; W = $w1 }, @{ T = 'Revenue'; W = $w2 }, @{ T = 'Expenses'; W = $w3 }, @{ T = 'Notes'; W = $w4 })

    $lines += '0.86 0.86 0.84 rg'
    $lines += ('{0} {1} {2} {3} re f' -f $left, $rowY, $totalW, $rowH)
    $lines += '0 0 0 rg'
    $x = $left
    foreach ($h in $headers) {
        $lines += Pdf-Line $h.T 12 ($x + 8) ($rowY + 8)
        $x += $h.W
    }

    foreach ($r in $rows) {
        $rowY -= $rowH
        $lines += '0.93 0.93 0.92 rg'
        $lines += ('{0} {1} {2} {3} re f' -f $left, $rowY, $totalW, $rowH)
        $lines += '0 0 0 rg'
        $x = $left
        $cells = @($r.Quarter, $r.Revenue, $r.Expenses, $r.Notes)
        for ($c = 0; $c -lt $cells.Count; $c++) {
            $lines += Pdf-Line $cells[$c] 12 ($x + 8) ($rowY + 8)
            $x += $headers[$c].W
        }
    }

    $lines += '0.7 0.7 0.7 RG'
    $topY = 690 + $rowH
    $bottomY = $rowY
    $x = $left
    foreach ($h in $headers) {
        $lines += ('{0} {1} {2} {3} re S' -f $x, $bottomY, 1, ($topY - $bottomY))
        $x += $h.W
    }
    $lines += ('{0} {1} {2} {3} re S' -f $left, $bottomY, $totalW, ($topY - $bottomY))
    for ($yy = $topY; $yy -ge $bottomY; $yy -= $rowH) {
        $lines += ('{0} {1} {2} {3} re S' -f $left, $yy, $totalW, 1)
    }

    New-Pdf (Join-Path $PdfDir 'pdf-tables-01.pdf') (($lines -join "`n") + "`n")
}

function Write-PdfImagesCaptions {
    # A report page that embeds a small image plus a caption.
    $W = 640; $H = 360
    $canvas = New-Canvas $W $H (C 236 218 190)
    $g = $canvas[1]
    $g.FillEllipse((Brush (C 190 120 70)), 80, 60, 200, 200)
    $g.FillPolygon((Brush (C 96 140 100)), @(
        [System.Drawing.PointF]::new(360, 300),
        [System.Drawing.PointF]::new(420, 120),
        [System.Drawing.PointF]::new(480, 300)))
    $g.FillPolygon((Brush (C 96 140 100)), @(
        [System.Drawing.PointF]::new(430, 300),
        [System.Drawing.PointF]::new(520, 160),
        [System.Drawing.PointF]::new(560, 300)))
    $tmpJpeg = Join-Path $PdfDir '_figure-01.tmp.jpg'
    Save-Jpeg $canvas[0] $tmpJpeg 85
    $jpegBytes = [System.IO.File]::ReadAllBytes($tmpJpeg)
    Dispose-Canvas $canvas

    $lines = @()
    $lines += Pdf-Line 'Site Survey Report - West Meadow' 18 72 760
    $lines += Pdf-Line 'Figure 1 shows the new tree line planted after the frost.' 12 72 740
    $lines += Pdf-Line 'The oaks are spaced nine meters apart to leave room for' 12 72 726
    $lines += Pdf-Line 'the wildflower corridor.' 12 72 712
    $lines += ''
    $lines += 'q 460 0 0 260 76 300 cm /Im0 Do Q'
    $lines += ''
    $lines += Pdf-Line 'Figure 1: New tree line, west meadow.' 10 72 268

    New-Pdf (Join-Path $PdfDir 'pdf-images-captions-01.pdf') (($lines -join "`n") + "`n") $jpegBytes 640 360
    Remove-Item $tmpJpeg -Force
}

function Write-BadMetadataPdf {
    # Deliberately minimal: no title, no author, no document information dict.
    $lines = @()
    $lines += Pdf-Line 'untitled fragment' 16 72 720
    $lines += Pdf-Line 'This page ships with no title, no author, and no metadata.' 12 72 700
    $lines += Pdf-Line 'Extraction should still surface the text above.' 12 72 686
    New-Pdf (Join-Path $PdfDir 'pdf-bad-metadata-01.pdf') (($lines -join "`n") + "`n")
}

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
