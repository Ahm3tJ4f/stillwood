# Installs stillwood from its GitHub releases on Windows.
#
#   irm https://raw.githubusercontent.com/Ahm3tJ4f/stillwood/main/install.ps1 | iex
#
# Settings, all optional:
#   $env:STILLWOOD_VERSION      a release tag such as v0.1.0 (default: the latest release)
#   $env:STILLWOOD_INSTALL_DIR  where the binary goes (default: %LOCALAPPDATA%\stillwood\bin)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'Ahm3tJ4f/stillwood'
$version = if ($env:STILLWOOD_VERSION) { $env:STILLWOOD_VERSION } else { 'latest' }
$dir = if ($env:STILLWOOD_INSTALL_DIR) { $env:STILLWOOD_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'stillwood\bin' }
$base = if ($version -eq 'latest') { "https://github.com/$repo/releases/latest/download" } else { "https://github.com/$repo/releases/download/$version" }
if ($env:STILLWOOD_DOWNLOAD_URL) { $base = $env:STILLWOOD_DOWNLOAD_URL }
$asset = 'stillwood-windows-x64.zip'

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("stillwood-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "stillwood: downloading $asset"
  Invoke-WebRequest -Uri "$base/$asset" -OutFile (Join-Path $tmp $asset)
  Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS')

  $line = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { $_ -match "  $([regex]::Escape($asset))$" }
  $expected = ($line -split '\s+')[0]
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $asset)).Hash.ToLower()
  if (-not $expected -or $expected -ne $actual) { throw "stillwood: the checksum of $asset is wrong" }

  Expand-Archive -Path (Join-Path $tmp $asset) -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item (Join-Path $tmp 'stillwood.exe') (Join-Path $dir 'stillwood.exe') -Force
} finally {
  Remove-Item -Recurse -Force $tmp
}

$installed = & (Join-Path $dir 'stillwood.exe') --version
Write-Host "stillwood: installed $installed to $dir"

$path = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($path -split ';') -notcontains $dir) {
  $joined = if ([string]::IsNullOrEmpty($path)) { $dir } else { "$path;$dir" }
  [Environment]::SetEnvironmentVariable('Path', $joined, 'User')
  Write-Host "stillwood: added $dir to your PATH. Open a new terminal, then start: stillwood"
} else {
  Write-Host 'stillwood: start it with: stillwood'
}
