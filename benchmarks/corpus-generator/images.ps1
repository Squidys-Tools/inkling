function Write-Photo {
    # A photographic-style landscape: gradient sky, sun, mountains, trees.
    $W = 1024; $H = 768
    $canvas = New-Canvas $W $H (C 150 190 220)
    $g = $canvas[1]

    $sky = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new(0, 0, $W, $H), (C 196 222 240), (C 242 214 178), 90)
    $g.FillRectangle($sky, 0, 0, $W, $H)

    $g.FillEllipse((Brush (C 255 248 222)), 640, 90, 150, 150)

    $farMtn = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(0, 560),
        [System.Drawing.PointF]::new(160, 380),
        [System.Drawing.PointF]::new(330, 520),
        [System.Drawing.PointF]::new(520, 350),
        [System.Drawing.PointF]::new(760, 540),
        [System.Drawing.PointF]::new($W, 420),
        [System.Drawing.PointF]::new($W, 600),
        [System.Drawing.PointF]::new(0, 600)
    )
    $g.FillPolygon((Brush (C 138 150 158)), $farMtn)

    $nearMtn = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(0, 640),
        [System.Drawing.PointF]::new(240, 500),
        [System.Drawing.PointF]::new(430, 610),
        [System.Drawing.PointF]::new(700, 470),
        [System.Drawing.PointF]::new($W, 600),
        [System.Drawing.PointF]::new($W, 660),
        [System.Drawing.PointF]::new(0, 660)
    )
    $g.FillPolygon((Brush (C 96 112 104)), $nearMtn)

    $tree = Brush (C 60 84 66)
    $g.FillPolygon($tree, @(
        [System.Drawing.PointF]::new(120, 700),
        [System.Drawing.PointF]::new(155, 610),
        [System.Drawing.PointF]::new(190, 700)))
    $g.FillPolygon($tree, @(
        [System.Drawing.PointF]::new(165, 660),
        [System.Drawing.PointF]::new(195, 585),
        [System.Drawing.PointF]::new(225, 660)))

    $g.FillRectangle((Brush (C 84 120 96)), 0, 690, $W, 78)

    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-photo-01.jpg')
    Dispose-Canvas $canvas
}

function Write-DesignRef {
    # A pastel moodboard: swatch grid plus translucent overlapping shapes.
    $W = 1024; $H = 768
    $canvas = New-Canvas $W $H (C 247 247 245)
    $g = $canvas[1]

    $swatches = @(
        (C 239 210 190), (C 196 218 232), (C 210 226 196),
        (C 238 228 174), (C 226 206 232), (C 240 190 176)
    )
    $sw = 240; $sh = 180
    for ($row = 0; $row -lt 2; $row++) {
        for ($col = 0; $col -lt 3; $col++) {
            $x = 64 + $col * 296; $y = 90 + $row * 296
            $g.FillRectangle((Brush $swatches[$row * 3 + $col]), $x, $y, $sw, $sh)
        }
    }

    $g.FillEllipse((Brush (C 120 60 40)), 430, 150, 180, 180)
    $g.FillEllipse((Brush (C 60 90 70)), 560, 260, 220, 220)

    $g.DrawString(
        'palette study no. 4',
        (New-Font 'Georgia' 30 ([System.Drawing.FontStyle]::Italic)),
        (Brush (C 70 70 70)),
        64, 30)

    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-design-ref-01.jpg')
    Dispose-Canvas $canvas
}

function Draw-RoomScene {
    param([System.Drawing.Graphics]$g, [int]$W, [int]$H, [string]$Tone)
    $warm = $Tone -eq 'warm'
    $wall = if ($warm) { C 214 184 158 } else { C 201 190 179 }
    $g.Clear($wall)

    $floor = if ($warm) { C 150 110 84 } else { C 146 128 112 }
    $g.FillRectangle((Brush $floor), 0, [int]($H * 0.72), $W, [int]($H * 0.28))

    $g.FillRectangle((Brush (C 225 234 240)), 80, 55, 300, 235)
    $sun = if ($warm) { C 244 198 130 } else { C 216 206 192 }
    $g.FillEllipse((Brush $sun), 330, 90, 90, 90)

    $g.FillRectangle((Brush (C 120 96 72)), 520, 400, 84, 96)
    $leaf = Brush (C 96 140 100)
    $g.FillEllipse($leaf, 500, 340, 60, 80)
    $g.FillEllipse($leaf, 562, 330, 70, 92)
    $g.FillEllipse($leaf, 522, 312, 50, 62)

    $chair = Brush (C 90 70 55)
    $g.FillRectangle($chair, 185, 460, 120, 22)
    $g.FillRectangle($chair, 205, 372, 16, 112)
    $g.FillRectangle($chair, 269, 372, 16, 112)
    $g.FillRectangle($chair, 185, 372, 100, 16)

    $rug = if ($warm) { C 188 120 92 } else { C 168 148 128 }
    $g.FillEllipse((Brush $rug), 420, 540, 200, 62)
}

function Write-SimilarA {
    $W = 1024; $H = 768
    $canvas = New-Canvas $W $H (C 214 184 158)
    Draw-RoomScene $canvas[1] $W $H 'warm'
    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-similar-01.jpg')
    Dispose-Canvas $canvas

    $canvas = New-Canvas $W $H (C 201 190 179)
    Draw-RoomScene $canvas[1] $W $H 'cool'
    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-similar-02.jpg')
    Dispose-Canvas $canvas
}

function Draw-Dunes {
    param([System.Drawing.Graphics]$g, [int]$W, [int]$H, [string]$Tone)
    $orange = $Tone -eq 'orange'
    $skyTop = if ($orange) { C 255 214 150 } else { C 160 150 210 }
    $skyBottom = if ($orange) { C 250 150 90 } else { C 80 66 130 }
    $sky = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new(0, 0, $W, $H), $skyTop, $skyBottom, 90)
    $g.FillRectangle($sky, 0, 0, $W, $H)

    $g.FillEllipse((Brush (C 255 244 214)), 420, 120, 180, 180)

    $duneFar = if ($orange) { C 214 128 76 } else { C 90 74 128 }
    $g.FillPolygon((Brush $duneFar), @(
        [System.Drawing.PointF]::new(0, 470),
        [System.Drawing.PointF]::new(180, 350),
        [System.Drawing.PointF]::new(380, 460),
        [System.Drawing.PointF]::new(560, 330),
        [System.Drawing.PointF]::new($W, 450),
        [System.Drawing.PointF]::new($W, $H),
        [System.Drawing.PointF]::new(0, $H)))

    $duneNear = if ($orange) { C 168 94 52 } else { C 58 46 96 }
    $g.FillPolygon((Brush $duneNear), @(
        [System.Drawing.PointF]::new(0, 620),
        [System.Drawing.PointF]::new(240, 500),
        [System.Drawing.PointF]::new(520, 610),
        [System.Drawing.PointF]::new(760, 480),
        [System.Drawing.PointF]::new($W, 580),
        [System.Drawing.PointF]::new($W, $H),
        [System.Drawing.PointF]::new(0, $H)))
}

function Write-SimilarB {
    $W = 1024; $H = 768
    $canvas = New-Canvas $W $H (C 255 214 150)
    Draw-Dunes $canvas[1] $W $H 'orange'
    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-similar-03.jpg')
    Dispose-Canvas $canvas

    $canvas = New-Canvas $W $H (C 160 150 210)
    Draw-Dunes $canvas[1] $W $H 'violet'
    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-similar-04.jpg')
    Dispose-Canvas $canvas
}

function Write-Distractor {
    # A dark blue ocean scene: visually different from both similarity groups.
    $W = 1024; $H = 768
    $canvas = New-Canvas $W $H (C 22 42 74)
    $g = $canvas[1]

    $water = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new(0, 0, $W, $H), (C 26 56 96), (C 10 20 44), 90)
    $g.FillRectangle($water, 0, 0, $W, $H)

    $g.FillEllipse((Brush (C 238 244 250)), 120, 90, 100, 100)

    $line = [System.Drawing.Pen]::new((C 190 210 230 120))
    $line.Width = 2
    foreach ($y in @(280, 360, 440, 520)) {
        $g.DrawBezier($line,
            [System.Drawing.PointF]::new(0, $y),
            [System.Drawing.PointF]::new($W * 0.33, $y - 40),
            [System.Drawing.PointF]::new($W * 0.66, $y + 40),
            [System.Drawing.PointF]::new($W, $y))
    }

    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-distractor-01.jpg')
    Dispose-Canvas $canvas
}

function Write-LowRes {
    # A deliberately tiny scene, kept at low resolution on purpose.
    $W = 120; $H = 90
    $canvas = New-Canvas $W $H (C 226 218 208)
    $g = $canvas[1]

    $g.FillRectangle((Brush (C 148 112 84)), 10, 60, 100, 26)
    $g.FillEllipse((Brush (C 190 52 44)), 45, 22, 40, 38)
    $g.FillRectangle((Brush (C 96 82 64)), 60, 8, 6, 30)

    Save-Jpeg $canvas[0] (Join-Path $ImgDir 'image-lowres-01.jpg')
    Dispose-Canvas $canvas
}
