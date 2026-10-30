function C {
    param([byte]$r, [byte]$g, [byte]$b, [byte]$a = 255)
    [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function New-Canvas {
    param([int]$W, [int]$H, [System.Drawing.Color]$Back)
    $bmp = [System.Drawing.Bitmap]::new($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear($Back)
    , @($bmp, $g)
}

function Save-Jpeg {
    param([System.Drawing.Bitmap]$Bmp, [string]$Path, [int]$Quality = 90)
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object { $_.MimeType -eq 'image/jpeg' }
    $enc = [System.Drawing.Imaging.Encoder]::Quality
    $params = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $params.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new($enc, $Quality)
    $Bmp.Save($Path, $codec, $params)
}

function Save-Png {
    param([System.Drawing.Bitmap]$Bmp, [string]$Path)
    $Bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Dispose-Canvas {
    param($Canvas)
    $Canvas[1].Dispose()
    $Canvas[0].Dispose()
}

function New-Font {
    param([string]$Family, [single]$Size, [System.Drawing.FontStyle]$Style = 'Regular')
    [System.Drawing.Font]::new($Family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Brush {
    param([System.Drawing.Color]$Color)
    [System.Drawing.SolidBrush]::new($Color)
}

function Draw-WindowChrome {
    # Draws a light browser/app title bar so images read as screenshots.
    param(
        [System.Drawing.Graphics]$g,
        [int]$W,
        [string]$Url = ''
    )
    $g.FillRectangle((Brush (C 236 236 233)), 0, 0, $W, 40)
    foreach ($x in @(16, 34, 52)) {
        $g.FillEllipse((Brush (C 226 226 220)), $x, 15, 10, 10)
    }
    if ($Url) {
        $g.FillRectangle((Brush (C 255 255 255)), 80, 10, $W - 180, 20)
        $g.DrawString(
            $Url,
            (New-Font 'Segoe UI' 12),
            (Brush (C 120 120 118)),
            92, 12)
    }
}

function Write-ExpectedOcr {
    param([string]$Id, [string]$Text)
    [System.IO.File]::WriteAllText(
        (Join-Path $OcrExpDir ($Id + '.txt')),
        $Text,
        [System.Text.UTF8Encoding]::new($false))
}
