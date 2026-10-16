param(
  [string]$CxDirectory = (Join-Path $env:USERPROFILE '.cx'),
  [string]$SharedHome = (Join-Path $env:USERPROFILE '.codex'),
  [string]$SqliteHome = '',
  [string]$CodexEntry = 'C:\Program Files\nodejs\node_modules\@openai\codex\bin\codex.js',
  [switch]$NoPath
)
$ErrorActionPreference = 'Stop'
$CxDirectory = [IO.Path]::GetFullPath($CxDirectory)
$SharedHome = (Resolve-Path -LiteralPath $SharedHome).Path
if ($CxDirectory -eq $SharedHome) { throw 'CX must have an independent configuration directory' }
if (!(Test-Path -LiteralPath $CodexEntry -PathType Leaf)) { throw "Codex entry missing: $CodexEntry" }
if (!$SqliteHome) { $SqliteHome = $SharedHome }
$SqliteHome = [IO.Path]::GetFullPath($SqliteHome)
$null = New-Item -ItemType Directory -Force -Path $CxDirectory
function Connect-SharedPath([string]$Name, [bool]$Directory) {
  $target = Join-Path $SharedHome $Name
  $link = Join-Path $CxDirectory $Name
  $existing = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
  if ($existing) {
    $same = if ($Directory) { $existing.LinkType -and [IO.Path]::GetFullPath([string]$existing.Target[0]) -eq [IO.Path]::GetFullPath($target) } else {
      $env:CX_CHECK_LINK = $link; $env:CX_CHECK_TARGET = $target
      node -e "const f=require('fs');const a=f.statSync(process.env.CX_CHECK_LINK,{bigint:true}),b=f.statSync(process.env.CX_CHECK_TARGET,{bigint:true});process.exit(a.dev===b.dev&&a.ino===b.ino?0:1)"
      $LASTEXITCODE -eq 0
    }
    if (!$same) {
      throw "Refusing to overwrite existing path: $link"
    }
    return
  }
  if (!(Test-Path -LiteralPath $target)) {
    if ($Directory) { $null = New-Item -ItemType Directory -Path $target }
    else { [IO.File]::WriteAllText($target, '') }
  }
  $type = if ($Directory) { 'Junction' } else { 'HardLink' }
  $null = New-Item -ItemType $type -Path $link -Target $target
}
foreach ($name in @('sessions','archived_sessions','thread-writer-locks','project-metadata-locks')) { Connect-SharedPath $name $true }
foreach ($name in @('history.jsonl','session_index.jsonl')) { Connect-SharedPath $name $false }
$settings = @{ sharedHome = $SharedHome; sqliteHome = $SqliteHome; codexEntry = $CodexEntry }
$encoding = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $CxDirectory 'launcher.json'), ($settings | ConvertTo-Json), $encoding)
$config = Join-Path $CxDirectory 'config.toml'
if (!(Test-Path -LiteralPath $config)) {
  [IO.File]::WriteAllText($config, "# CX configuration; managed independently from Codex.`ncli_auth_credentials_store = `"file`"`n", $encoding)
}
$bin = Join-Path $CxDirectory 'bin'
$null = New-Item -ItemType Directory -Force -Path $bin
$entry = Join-Path $PSScriptRoot 'cx.mjs'
$shim = "@echo off`r`nsetlocal`r`nnode `"$entry`" %*`r`nexit /b %errorlevel%`r`n"
[IO.File]::WriteAllText((Join-Path $bin 'cx.cmd'), $shim, $encoding)
if (!$NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable('Path','User')
  if (($userPath -split ';') -notcontains $bin) { [Environment]::SetEnvironmentVariable('Path', "$bin;$userPath", 'User') }
}
Write-Output "Installed CX: $bin\cx.cmd"
Write-Output "Configuration: $config"
Write-Output "Shared sessions: $SharedHome"
Write-Output 'Open a new terminal to use cx. Existing Codex login and configuration were not copied or modified.'
