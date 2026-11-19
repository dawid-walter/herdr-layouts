<#
  Installs a Herdr layout package (layouts/, mods/, themes/, keys.json) into the Herdr app home.
  The same script ships with every package of this family; only the $Name line (right after param) differs.

  .\install.ps1              back up the Herdr home, then copy the package in (never overwrites files it doesn't own)
  .\install.ps1 -DryRun      show what would happen, change nothing
  .\install.ps1 -Uninstall   remove exactly what this package installed (files and keys, from its manifest)
  .\install.ps1 -NoKeys      leave keys.json alone and print the line to add by hand
  -HerdrHome <path>          another Herdr home (default: $env:HERDR_APP_HOME or ~\.config\herdr-app)

  It does not switch your layout and does not touch settings.json.
#>
[CmdletBinding()]
param(
  [string]$HerdrHome = $(if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $HOME ".config\herdr-app" }),
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$NoKeys
)
$Name = "breach-protocol"   # the only line that differs between packages
$ErrorActionPreference = "Stop"
$Package = $PSScriptRoot
$Manifest = Join-Path $HerdrHome "$Name.manifest.txt"
$KeysHome = Join-Path $HerdrHome "keys.json"
$KeysPkg = Join-Path $Package "keys.json"
$Skip = @("gpui-kit.d.ts", "herdr.d.ts", "jsconfig.json")

if (-not (Test-Path $HerdrHome)) { throw "Herdr home not found: $HerdrHome (is the Herdr app installed?)" }

function Say($msg) { if ($DryRun) { Write-Host "[dry-run] $msg" } else { Write-Host $msg } }

function Backup-Home {
  $stamp = Get-Date -Format "yyyy-MM-dd_HHmmss_fff"
  $dest = Join-Path (Split-Path $HerdrHome -Parent) "herdr-app-backup-$stamp"
  if ($DryRun) { Say "would back up $HerdrHome -> $dest"; return }
  New-Item -ItemType Directory -Path $dest | Out-Null
  Get-ChildItem -Path $HerdrHome -Force | Where-Object { $_.Name -notlike "*.sock" } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
  }
  Write-Host "Backup: $dest"
}

function Read-Json($path) { if (Test-Path $path) { Get-Content $path -Raw | ConvertFrom-Json } else { [pscustomobject]@{} } }
function Write-Text($path, $text) { [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false)) }
function Write-Json($obj, $path) { Write-Text $path (($obj | ConvertTo-Json -Depth 10) + "`n") }

# ---------------- uninstall ----------------
if ($Uninstall) {
  if (-not (Test-Path $Manifest)) { throw "No $Name.manifest.txt in ${HerdrHome}: nothing to uninstall." }
  Backup-Home
  $lines = Get-Content $Manifest | Where-Object { $_ -and -not $_.StartsWith("#") }
  $files = $lines | Where-Object { -not $_.StartsWith("key:") }
  $keys = $lines | Where-Object { $_.StartsWith("key:") }
  foreach ($rel in $files) {
    $p = Join-Path $HerdrHome $rel
    if (Test-Path $p -PathType Leaf) { Say "remove $rel"; if (-not $DryRun) { Remove-Item $p -Force } }
  }
  # folders that held our files, deepest first; remove only the ones left empty
  $dirs = $files | ForEach-Object { $d = Split-Path $_ -Parent; while ($d) { $d; $d = Split-Path $d -Parent } } |
    Where-Object { $_ -notin @("layouts", "mods", "themes") } | Sort-Object -Unique | Sort-Object { $_.Length } -Descending
  foreach ($rel in $dirs) {
    $d = Join-Path $HerdrHome $rel
    if ((Test-Path $d) -and -not (Get-ChildItem $d -Force)) { Say "remove empty $rel\"; if (-not $DryRun) { Remove-Item $d -Force } }
  }
  # keys we added, only if they still hold our value
  if ($keys -and (Test-Path $KeysHome)) {
    $keysObj = Read-Json $KeysHome
    foreach ($k in $keys) {
      $parts = $k.Substring(4).Split("|", 3); $sec, $key, $val = $parts
      $s = $keysObj.PSObject.Properties[$sec]
      if ($s -and $s.Value.PSObject.Properties[$key] -and $s.Value.$key -eq $val) {
        Say "remove key [$sec] $key"
        if (-not $DryRun) { $s.Value.PSObject.Properties.Remove($key); if (-not $s.Value.PSObject.Properties.Count) { $keysObj.PSObject.Properties.Remove($sec) } }
      }
    }
    if (-not $DryRun) { Write-Json $keysObj $KeysHome }
  }
  if (-not $DryRun) { Remove-Item $Manifest -Force }
  Write-Host "$Name removed. If it was the shown layout, Herdr falls back to main."
  return
}

# ---------------- install ----------------
$items = @()
foreach ($top in @("themes", "layouts", "mods")) {
  $src = Join-Path $Package $top
  if (Test-Path $src) {
    Get-ChildItem $src -Recurse -File | Where-Object { $_.Name -notin $Skip } | ForEach-Object { $items += $_.FullName.Substring($Package.Length + 1) }
  }
}
$ours = @(); if (Test-Path $Manifest) { $ours = Get-Content $Manifest }
$foreign = $items | Where-Object { (Test-Path (Join-Path $HerdrHome $_)) -and ($ours -notcontains $_) }
if ($foreign) {
  Write-Host "These files already exist and are not from $Name, nothing was changed:" -ForegroundColor Yellow
  $foreign | ForEach-Object { Write-Host "  $_" }
  throw "Name clash. Rename or remove those files, then run again."
}

Backup-Home
foreach ($rel in $items) {
  Say "copy $rel"
  if ($DryRun) { continue }
  $to = Join-Path $HerdrHome $rel
  New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
  Copy-Item (Join-Path $Package $rel) $to -Force
}

# merge keys.json: add sections and keys, never replace a key the person already uses
$keyLines = @()
if ((Test-Path $KeysPkg) -and $NoKeys) {
  Write-Host "-NoKeys: keys.json left as it is. To get the key, add this by hand:" -ForegroundColor Yellow
  Write-Host (Get-Content $KeysPkg -Raw)
} elseif (Test-Path $KeysPkg) {
  Write-Host "Note: editing keys.json makes it yours; Herdr then stops adding new default shortcuts on upgrade (AGENTS.md, Keys). Use -NoKeys to skip." -ForegroundColor Yellow
  $pkgKeys = Read-Json $KeysPkg
  $keysObj = Read-Json $KeysHome
  foreach ($sec in $pkgKeys.PSObject.Properties) {
    if (-not $keysObj.PSObject.Properties[$sec.Name]) { $keysObj | Add-Member -NotePropertyName $sec.Name -NotePropertyValue ([pscustomobject]@{}) }
    $target = $keysObj.($sec.Name)
    foreach ($k in $sec.Value.PSObject.Properties) {
      $have = $target.PSObject.Properties[$k.Name]
      if ($have -and $have.Value -ne $k.Value) {
        Write-Host "Key [$($sec.Name)] $($k.Name) is already bound to '$($have.Value)'; kept yours. Bind '$($k.Value)' by hand if you want it." -ForegroundColor Yellow
        continue
      }
      if (-not $have) { $target | Add-Member -NotePropertyName $k.Name -NotePropertyValue $k.Value }
      Say "key [$($sec.Name)] $($k.Name) -> $($k.Value)"
      $keyLines += "key:$($sec.Name)|$($k.Name)|$($k.Value)"
    }
  }
  if (-not $DryRun) { Write-Json $keysObj $KeysHome }
}

if (-not $DryRun) {
  Write-Text $Manifest ((@("# installed by the $Name package; used by install.ps1 -Uninstall") + $items + $keyLines) -join "`r`n")
  Write-Host ("Installed {0} files and {1} keys into {2}" -f $items.Count, $keyLines.Count, $HerdrHome)
  Write-Host "Switch layouts with Ctrl+Shift+L in Herdr, or: herdr-app do layout.switch --name $Name"
  Write-Host "Optional: to hear this layout's sounds instead of Herdr's, point sounds.done and sounds.blocked in settings.json at its files (README, Install)."
}
