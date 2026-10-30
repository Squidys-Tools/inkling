$screenshotLarge = @{
    eyebrow = 'THE QUIET WEB'
    headline = 'A slower corner of the internet'
    body = 'Fewer banners, more reading. We hand-pick one essay a week and send it on Friday.'
    button = 'Join the list'
    footer = 'Already subscribed? Sign in.'
}

function Write-ScreenshotLargeText {
    $W = 1280; $H = 800
    $canvas = New-Canvas $W $H (C 251 250 246)
    $g = $canvas[1]
    Draw-WindowChrome $g $W 'thequietweb.example/'

    $g.DrawString(
        $screenshotLarge.eyebrow,
        (New-Font 'Arial' 18 ([System.Drawing.FontStyle]::Bold)),
        (Brush (C 160 100 60)),
        120, 150)

    $g.DrawString(
        $screenshotLarge.headline,
        (New-Font 'Georgia' 52),
        (Brush (C 40 40 40)),
        [System.Drawing.RectangleF]::new(120, 200, 900, 200))

    $g.DrawString(
        $screenshotLarge.body,
        (New-Font 'Georgia' 26),
        (Brush (C 90 90 90)),
        [System.Drawing.RectangleF]::new(120, 360, 800, 120))

    $g.FillRectangle((Brush (C 239 120 70)), 120, 500, 180, 56)
    $g.DrawString(
        $screenshotLarge.button,
        (New-Font 'Arial' 20 ([System.Drawing.FontStyle]::Bold)),
        (Brush (C 255 255 255)),
        150, 515)

    $g.DrawString(
        $screenshotLarge.footer,
        (New-Font 'Arial' 14),
        (Brush (C 130 130 128)),
        120, 600)

    Save-Png $canvas[0] (Join-Path $ScrDir 'screenshot-large-text-01.png')
    Dispose-Canvas $canvas
    Write-ExpectedOcr 'screenshot-large-text-01' (
        $screenshotLarge.eyebrow + "`n" +
        $screenshotLarge.headline + "`n" +
        $screenshotLarge.body + "`n" +
        $screenshotLarge.button + "`n" +
        $screenshotLarge.footer)
}

$screenshotSmallRows = @(
    @{ Name = 'annual-report-2025.pdf';   Date = 'Jul 02 14:12'; Size = '4.2 MB'; Kind = 'PDF' },
    @{ Name = 'brand-guidelines.pdf';     Date = 'Jun 18 09:40'; Size = '8.7 MB'; Kind = 'PDF' },
    @{ Name = 'field-notes-spring.txt';   Date = 'May 03 18:05'; Size = '12 KB';  Kind = 'Text' },
    @{ Name = 'logo-mark.png';            Date = 'Apr 27 11:22'; Size = '340 KB'; Kind = 'Image' },
    @{ Name = 'meeting-notes.md';         Date = 'Apr 12 16:48'; Size = '6 KB';   Kind = 'Markdown' },
    @{ Name = 'onboarding-flow.pdf';      Date = 'Mar 30 10:02'; Size = '1.9 MB'; Kind = 'PDF' },
    @{ Name = 'photo-batch-01.zip';       Date = 'Mar 21 13:33'; Size = '48 MB';  Kind = 'Archive' },
    @{ Name = 'readme.txt';               Date = 'Mar 02 08:17'; Size = '2 KB';   Kind = 'Text' },
    @{ Name = 'sketchbook-scan.jpg';      Date = 'Feb 14 15:29'; Size = '5.1 MB'; Kind = 'Image' },
    @{ Name = 'timeline-draft.xlsx';      Date = 'Feb 01 09:58'; Size = '22 KB';  Kind = 'Spreadsheet' }
)

function Write-ScreenshotSmallText {
    $W = 1280; $H = 800
    $canvas = New-Canvas $W $H (C 255 255 255)
    $g = $canvas[1]
    Draw-WindowChrome $g $W 'files.example/home/archive'

    $headers = @('Name', 'Modified', 'Size', 'Kind')
    $fontH = New-Font 'Segoe UI' 16 ([System.Drawing.FontStyle]::Bold)
    $fontR = New-Font 'Segoe UI' 14
    $colX = @(120, 560, 780, 900)
    $ink = Brush (C 50 50 50)
    $muted = Brush (C 110 110 108)

    for ($i = 0; $i -lt 4; $i++) {
        $g.DrawString($headers[$i], $fontH, $muted, $colX[$i], 70)
    }

    $y = 120
    $rowIndex = 0
    foreach ($row in $screenshotSmallRows) {
        if ($rowIndex % 2 -eq 0) {
            $g.FillRectangle((Brush (C 247 247 245)), 60, $y, 1160, 46)
        }
        $g.DrawString($row.Name, $fontR, $ink, $colX[0], $y + 12)
        $g.DrawString($row.Date, $fontR, $muted, $colX[1], $y + 12)
        $g.DrawString($row.Size, $fontR, $muted, $colX[2], $y + 12)
        $g.DrawString($row.Kind, $fontR, $muted, $colX[3], $y + 12)
        $y += 46
        $rowIndex++
    }

    Save-Png $canvas[0] (Join-Path $ScrDir 'screenshot-small-text-01.png')
    Dispose-Canvas $canvas

    $expected = 'Name Modified Size Kind' + "`n"
    foreach ($row in $screenshotSmallRows) {
        $expected += ($row.Name + ' ' + $row.Date + ' ' + $row.Size + ' ' + $row.Kind) + "`n"
    }
    Write-ExpectedOcr 'screenshot-small-text-01' $expected
}
