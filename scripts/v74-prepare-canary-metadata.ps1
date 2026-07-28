$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
$outDir = Join-Path $project "deployments/v74-canary-package"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "LEVERAGE X V74 - CANARY METADATA + IMAGE PACKAGE" -ForegroundColor Cyan
$name = Read-Host "Token name"
$symbol = (Read-Host "Ticker (1-12 characters)").ToUpperInvariant()
$imagePath = (Read-Host "Drag the image/GIF into this window, then press Enter").Trim('"')
if ($name.Length -lt 2 -or $name.Length -gt 64) { throw "Token name must be 2-64 characters." }
if ($symbol -notmatch '^[A-Z0-9]{1,12}$') { throw "Ticker must use 1-12 letters or numbers." }
if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw "Image file was not found." }
$ext = [IO.Path]::GetExtension($imagePath).ToLowerInvariant()
if (@('.png','.jpg','.jpeg','.webp','.gif') -notcontains $ext) { throw "Use PNG, JPG, WEBP, or GIF." }
$file = Get-Item -LiteralPath $imagePath
if ($file.Length -gt 15MB) { throw "Image/GIF must be 15 MB or smaller." }
$imageHash = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
$imageName = "token-image$ext"
Copy-Item -LiteralPath $imagePath -Destination (Join-Path $outDir $imageName) -Force

$x = Read-Host "X URL (optional)"
$telegram = Read-Host "Telegram URL (optional)"
$website = Read-Host "Website URL (optional)"
$description = "$name ($symbol), launched through Leverage X on Robinhood Chain."

$imageUri = ""
$metadataUri = ""
if ($env:PINATA_JWT) {
  Write-Host "Uploading image to IPFS through Pinata..." -ForegroundColor Yellow
  $imageResponse = curl.exe -sS -X POST "https://uploads.pinata.cloud/v3/files" -H "Authorization: Bearer $env:PINATA_JWT" -F "network=public" -F "file=@$imagePath"
  $imageJson = $imageResponse | ConvertFrom-Json
  $imageCid = if ($imageJson.data.cid) { $imageJson.data.cid } elseif ($imageJson.IpfsHash) { $imageJson.IpfsHash } else { $null }
  if (-not $imageCid) { throw "Pinata image upload failed: $imageResponse" }
  $imageUri = "ipfs://$imageCid"
}

$metadata = [ordered]@{
  name = $name
  symbol = $symbol
  description = $description
  image = $imageUri
  image_sha256 = $imageHash
  chain_id = 4663
  platform = "Leverage X"
  external_url = $website
  properties = [ordered]@{
    category = "image"
    files = @([ordered]@{ uri = $imageUri; type = switch ($ext) { '.gif' {'image/gif'} '.png' {'image/png'} '.webp' {'image/webp'} default {'image/jpeg'} } })
    socials = [ordered]@{ x = $x; telegram = $telegram; website = $website }
  }
}
$metadataPath = Join-Path $outDir "token-metadata.json"
$metadata | ConvertTo-Json -Depth 12 | Set-Content $metadataPath -Encoding UTF8

if ($env:PINATA_JWT) {
  Write-Host "Uploading metadata JSON to IPFS..." -ForegroundColor Yellow
  $metadataResponse = curl.exe -sS -X POST "https://uploads.pinata.cloud/v3/files" -H "Authorization: Bearer $env:PINATA_JWT" -F "network=public" -F "file=@$metadataPath"
  $metadataJson = $metadataResponse | ConvertFrom-Json
  $metadataCid = if ($metadataJson.data.cid) { $metadataJson.data.cid } elseif ($metadataJson.IpfsHash) { $metadataJson.IpfsHash } else { $null }
  if (-not $metadataCid) { throw "Pinata metadata upload failed: $metadataResponse" }
  $metadataUri = "ipfs://$metadataCid"
}

$manifest = [ordered]@{
  version = 74; chainId = 4663; tokenName = $name; symbol = $symbol
  imageFile = $imageName; imageSha256 = $imageHash; imageURI = $imageUri
  metadataFile = "token-metadata.json"; metadataURI = $metadataUri
  metadataReady = [bool]$metadataUri; preparedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $outDir "launch-manifest.json") -Encoding UTF8
Write-Host "Package created: deployments/v74-canary-package" -ForegroundColor Green
if ($metadataUri) {
  Write-Host "READY - Metadata URI: $metadataUri" -ForegroundColor Green
} else {
  Write-Host "LOCAL PACKAGE READY. Add PINATA_JWT later and rerun to upload automatically." -ForegroundColor Yellow
}
