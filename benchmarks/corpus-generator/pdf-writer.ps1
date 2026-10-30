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
