# Baseline snapshot of C: usage (apps / heavy folders). Safe read-only scan.
$ErrorActionPreference = 'SilentlyContinue'
$repoRoot = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $repoRoot 'baseline-c-drive-before-openclaw-2026-03-31.txt'

$lines = New-Object System.Collections.Generic.List[string]

function Add-Line([string]$s) { [void]$lines.Add($s) }

function Size-GB([long]$bytes) {
  if ($bytes -le 0) { return 0 }
  [math]::Round([double]$bytes / 1GB, 3)
}

function Dir-Sum([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return [int64]0 }
  try {
    $sum = (Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { [int64]0 } else { [int64]$sum }
  }
  catch { [int64]0 }
}

$now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Line '=== BASELINE C: DRIVE (before OpenClaw rerun) ==='
Add-Line ('Captured (local): ' + $now)
Add-Line ''

$vol = Get-Volume -DriveLetter C
Add-Line '--- Volume C: ---'
Add-Line ('FileSystemLabel: ' + $vol.FileSystemLabel)
Add-Line ('SizeGB: ' + (Size-GB ([int64]$vol.Size)))
Add-Line ('SizeRemainingGB: ' + (Size-GB ([int64]$vol.SizeRemaining)))
$used = [int64]$vol.Size - [int64]$vol.SizeRemaining
Add-Line ('UsedGB (approx): ' + (Size-GB $used))
Add-Line ('UsedPercent: ' + [math]::Round(100 * $used / [double]$vol.Size, 2))
Add-Line ''

function Report-TopDirs([string]$base, [string]$title, [int]$max = 60) {
  Add-Line ('--- ' + $title + ' ---')
  if (-not (Test-Path -LiteralPath $base)) {
    Add-Line '(path missing)'
    Add-Line ''
    return
  }
  $rows = @()
  Get-ChildItem -LiteralPath $base -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $b = Dir-Sum $_.FullName
    $rows += [PSCustomObject]@{ Name = $_.Name; Bytes = $b }
  }
  $rows = $rows | Sort-Object Bytes -Descending | Select-Object -First $max
  foreach ($r in $rows) {
    Add-Line ($r.Name + "`t" + (Size-GB $r.Bytes).ToString() + ' GB')
  }
  Add-Line ''
}

Report-TopDirs 'C:\' 'Top-level folders on C:\ (by size)' 40
Report-TopDirs 'C:\Program Files' 'C:\Program Files (subfolders)' 50
Report-TopDirs 'C:\Program Files (x86)' 'C:\Program Files (x86) (subfolders)' 35
Report-TopDirs $env:LOCALAPPDATA 'LOCALAPPDATA subfolders' 45
Report-TopDirs $env:APPDATA 'APPDATA (Roaming) subfolders' 40

Add-Line '--- Winget: installed packages (names only; truncated) ---'
try {
  & winget list --accept-source-agreements 2>$null | Select-Object -First 100 | ForEach-Object { Add-Line $_ }
}
catch { Add-Line '(winget unavailable)' }
Add-Line ''
Add-Line '=== END BASELINE ==='

[System.IO.File]::WriteAllText($outPath, ($lines -join "`r`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote: $outPath"
Write-Host ('C free GB: ' + (Size-GB ([int64]$vol.SizeRemaining)))
