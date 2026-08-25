# Sinkronisasi media EVKita — jalankan ulang kapan saja:
# powershell -NoProfile -ExecutionPolicy Bypass -File tools\sync-media.ps1
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$mediaDir = Join-Path $root "media\cars"
New-Item -ItemType Directory -Force -Path $mediaDir | Out-Null

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

$j = Get-Content -LiteralPath (Join-Path $root "data\content.json") -Raw | ConvertFrom-Json
$ok = 0

foreach ($car in $j.cars) {
  $url = $car.image
  if (-not $url -or $url -notmatch "^https?://") { continue }
  $ext = ".jpg"
  if ($url -match "\.(png|webp|jpe?g)([?#]|$)") {
    $ext = $matches[1].ToLower()
    if ($ext -eq "jpeg") { $ext = "jpg" }
  }
  $out = Join-Path $mediaDir ($car.id + "." + $ext)
  if ((Test-Path -LiteralPath $out) -and ((Get-Item -LiteralPath $out).Length -gt 3000)) { $ok++; continue }

  $urlQ = '"' + $url + '"'
  $outQ = '"' + $out + '"'
  & curl.exe -s -L --max-time 30 -A $ua -o $outQ $urlQ | Out-Null
  if ((Test-Path -LiteralPath $out) -and ((Get-Item -LiteralPath $out).Length -gt 3000)) {
    $ok++
    Write-Output ("OK   " + $car.id)
  } else {
    if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
    Write-Output ("FAIL " + $car.id + " (tetap pakai URL remote)")
  }
}

# Bangun ulang media-map
$ids = @($j.cars | ForEach-Object { $_.id })
$map = @{}
Get-ChildItem -LiteralPath $mediaDir -File | ForEach-Object {
  if ($ids -contains $_.BaseName) { $map[$_.BaseName] = "media/cars/" + $_.Name }
}
$map | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root "data\media-map.json") -Encoding UTF8

# Regenerate data.js (statis): gambar lokal + 4 konstanta
$carsForStatic = @()
foreach ($car in $j.cars) {
  $clone = $car | ConvertTo-Json -Depth 12 | ConvertFrom-Json
  $v = $map.PSObject.Properties[$car.id]
  if ($v -and $v.Value -like "media/*") { $clone.image = $v.Value }
  $carsForStatic += $clone
}

$carsJson = $carsForStatic | ConvertTo-Json -Depth 12 -Compress
$spkluJson = $j.spklu | ConvertTo-Json -Depth 6 -Compress
$bengkelJson = $j.bengkel | ConvertTo-Json -Depth 6 -Compress
$beritaJson = $j.berita | ConvertTo-Json -Depth 6 -Compress

$out = "const EV_CARS = $carsJson;`r`nconst SPKLU_LIST = $spkluJson;`r`nconst BENGKEL_LIST = $bengkelJson;`r`nconst BERITA_LIST = $beritaJson;"
Set-Content -LiteralPath (Join-Path $root "data.js") -Value $out -Encoding UTF8

Write-Output ("Selesai. Gambar lokal: " + $ok + " / " + $ids.Count + ". data.js diperbarui.")
