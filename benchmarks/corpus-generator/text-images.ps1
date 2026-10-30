function Write-Meme {
    $W = 900; $H = 900
    $canvas = New-Canvas $W $H (C 250 220 110)
    $g = $canvas[1]

    $g.FillEllipse((Brush (C 255 244 214)), 250, 330, 400, 400)
    $g.FillEllipse((Brush (C 60 60 60)), 340, 470, 28, 44)
    $g.FillEllipse((Brush (C 60 60 60)), 530, 470, 28, 44)
    $g.FillEllipse((Brush (C 200 120 100)), 380, 560, 140, 60)

    $topText = 'ME: I WILL JUST SAVE ONE LINK'
    $bottomText = 'ME 10 SECONDS LATER: ANOTHER 47 TABS'
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $outlinePen = [System.Drawing.Pen]::new((C 0 0 0), 5)
    $outlinePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $fill = Brush (C 255 255 255)

    foreach ($entry in @(
            @{ Text = $topText; Y = 40 },
            @{ Text = $bottomText; Y = 800 }
        )) {
        $font = New-Font 'Impact' 52 ([System.Drawing.FontStyle]::Bold)
        $size = $g.MeasureString($entry.Text, $font)
        $x = ($W - $size.Width) / 2
        $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $path.AddString(
            $entry.Text,
            $font.FontFamily,
            [int][System.Drawing.FontStyle]::Bold,
            52,
            [System.Drawing.PointF]::new($x, $entry.Y),
            [System.Drawing.StringFormat]::GenericDefault
        )
        $g.DrawPath($outlinePen, $path)
        $g.FillPath($fill, $path)
        $path.Dispose()
        $font.Dispose()
    }

    Save-Png $canvas[0] (Join-Path $ImgDir 'image-meme-01.png')
    Dispose-Canvas $canvas
    Write-ExpectedOcr 'image-meme-01' ($topText + "`n" + $bottomText)
}

$handwritingText = @(
    'friday',
    'call the studio',
    'finish the reading list',
    'water the plants',
    'remember: slow is fine'
)

function Write-Handwriting {
    # Lined paper with a Comic Sans scrawl that stands in for handwriting.
    $W = 900; $H = 560
    $canvas = New-Canvas $W $H (C 250 249 244)
    $g = $canvas[1]

    $rule = [System.Drawing.Pen]::new((C 188 208 226))
    $rule.Width = 1
    for ($y = 90; $y -lt $H - 40; $y += 44) {
        $g.DrawLine($rule, 70, $y, $W - 70, $y)
    }

    $font = New-Font 'Comic Sans MS' 26
    $ink = Brush (C 36 54 96)
    $y = 100
    foreach ($lineText in $handwritingText) {
        $g.TranslateTransform(84, $y + 8)
        $g.RotateTransform(-1.6)
        $g.DrawString($lineText, $font, $ink, 0, 0)
        $g.ResetTransform()
        $y += 44
    }

    Save-Png $canvas[0] (Join-Path $ImgDir 'image-handwriting-01.png')
    Dispose-Canvas $canvas
    Write-ExpectedOcr 'image-handwriting-01' ($handwritingText -join "`n")
}

$rotatedHeadline = 'FIELD REPORT'
$rotatedBody = 'The expedition set out before dawn with three cameras, a paper map, and no signal. By noon the fog had lifted and the valley opened like a held breath.'

function Write-RotatedText {
    $W = 900; $H = 620
    $canvas = New-Canvas $W $H (C 252 250 246)
    $g = $canvas[1]

    $g.TranslateTransform(420, 240)
    $g.RotateTransform(14)

    $g.DrawString(
        $rotatedHeadline,
        (New-Font 'Arial' 44 ([System.Drawing.FontStyle]::Bold)),
        (Brush (C 40 40 40)),
        [System.Drawing.RectangleF]::new(-320, -260, 640, 60))

    $g.DrawString(
        $rotatedBody,
        (New-Font 'Georgia' 26),
        (Brush (C 60 60 60)),
        [System.Drawing.RectangleF]::new(-320, -170, 620, 200))
    $g.ResetTransform()

    $g.DrawString(
        'Appendix B - rotation tolerance check',
        (New-Font 'Consolas' 14),
        (Brush (C 140 140 138)),
        40, 560)

    Save-Png $canvas[0] (Join-Path $ImgDir 'image-rotated-01.png')
    Dispose-Canvas $canvas
    Write-ExpectedOcr 'image-rotated-01' ($rotatedHeadline + "`n" + $rotatedBody + "`nAppendix B - rotation tolerance check")
}

$columnsText = @{
    left  = 'Barefoot in the morning grass. The kettle argues with itself. A stack of postcards, none of them addressed yet. The garden is patient. Rain on the tin roof sounds like applause you can keep.'
    right = 'Libraries smell like paper and rain. Somebody shelved the dictionaries out of order on purpose. Notes multiply in the margins overnight. A bookmark is a promise between two afternoons.'
}

function Write-Columns {
    $W = 900; $H = 620
    $canvas = New-Canvas $W $H (C 247 246 242)
    $g = $canvas[1]

    $g.DrawString(
        'FIELD NOTES - PAGE 12',
        (New-Font 'Georgia' 30),
        (Brush (C 40 40 40)),
        60, 36)

    $g.DrawLine([System.Drawing.Pen]::new((C 200 200 195)), 60, 84, 840, 84)

    $colWidth = 360
    $colIndex = 0
    foreach ($col in @('left', 'right')) {
        $x = 60 + $colIndex * 420
        $g.DrawString(
            ($col.ToUpper()),
            (New-Font 'Arial' 16 ([System.Drawing.FontStyle]::Bold)),
            (Brush (C 90 90 90)),
            $x, 110)
        $g.DrawString(
            $columnsText[$col],
            (New-Font 'Georgia' 20),
            (Brush (C 55 55 55)),
            [System.Drawing.RectangleF]::new($x, 150, $colWidth, 420))
        $colIndex++
    }

    Save-Png $canvas[0] (Join-Path $ImgDir 'image-columns-01.png')
    Dispose-Canvas $canvas
    Write-ExpectedOcr 'image-columns-01' (
        'FIELD NOTES - PAGE 12' + "`n" +
        'LEFT' + "`n" + $columnsText.left + "`n" +
        'RIGHT' + "`n" + $columnsText.right)
}
