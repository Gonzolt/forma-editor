$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildPath = Join-Path $projectRoot 'build'
New-Item -ItemType Directory -Force -Path $buildPath | Out-Null
foreach ($size in @(512, 256)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F1F0EB'))
    $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#1A1917'), $size * 0.034)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#B23A1B'))
    $graphics.DrawEllipse($pen, $size * 0.16, $size * 0.16, $size * 0.68, $size * 0.68)
    $graphics.FillEllipse($brush, $size * 0.49, $size * 0.40, $size * 0.19, $size * 0.19)
    if ($size -eq 512) {
        $bitmap.Save((Join-Path $buildPath 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } else {
        $stream = [System.IO.MemoryStream]::new()
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $png = $stream.ToArray()
        $ico = [System.IO.File]::Create((Join-Path $buildPath 'icon.ico'))
        $writer = [System.IO.BinaryWriter]::new($ico)
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
        $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
        $writer.Dispose(); $ico.Dispose(); $stream.Dispose()
    }
    $brush.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
