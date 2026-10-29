# Fonctions partagées par les scripts TeleCoding (Windows PowerShell 5.1+).
# Valeurs par défaut modifiables via les variables d'environnement
# TELECODING_TV_IP, TIZEN_HOME, TELECODING_PROFILE.

# 'Continue' et non 'Stop' : sous Windows PowerShell 5.1, 'Stop' transforme en erreur fatale
# le moindre message que sdb ou tizen.bat écrit sur stderr. Les erreurs sont gérées par Fail.
$ErrorActionPreference = 'Continue'

$Script:AppId      = 'TlCdLaunch.TeleCoding'
$Script:PackageId  = 'TlCdLaunch'
$Script:RepoRoot   = Split-Path -Parent $PSScriptRoot
$Script:StateFile  = Join-Path $PSScriptRoot '.state.json'
$Script:DefaultIp  = if ($env:TELECODING_TV_IP) { $env:TELECODING_TV_IP } else { '192.168.1.129' }
$Script:TizenHome  = if ($env:TIZEN_HOME) { $env:TIZEN_HOME } else { 'C:\tizen-studio' }

function Write-Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Warn2($text){ Write-Host "    !!  $text" -ForegroundColor Yellow }
function Write-Info($text) { Write-Host "        $text" }
function Fail($text)       { Write-Host "    XX  $text" -ForegroundColor Red; exit 1 }

function Get-Sdb {
    $p = Join-Path $Script:TizenHome 'tools\sdb.exe'
    if (-not (Test-Path $p)) { Fail "sdb.exe introuvable ($p). Installe Tizen Studio ou définis TIZEN_HOME." }
    return $p
}

function Get-TizenCli {
    $p = Join-Path $Script:TizenHome 'tools\ide\bin\tizen.bat'
    if (-not (Test-Path $p)) { Fail "tizen.bat introuvable ($p). Installe l'extension « TV Extensions » / CLI de Tizen Studio." }
    return $p
}

# Interroge l'API locale des TV Samsung (port 8001). Renvoie $null si ce n'est pas une Samsung.
function Get-SamsungInfo([string]$ip, [int]$timeoutSec = 3) {
    try {
        $r = Invoke-RestMethod -Uri "http://${ip}:8001/api/v2/" -TimeoutSec $timeoutSec -UseBasicParsing -ErrorAction Stop
        if ($r.device) { return $r.device }
    } catch { }
    return $null
}

function Get-LocalIPv4 {
    try {
        return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -ExpandProperty IPAddress)
    } catch {
        return @([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.IPAddressToString })
    }
}

# Exécute sdb et renvoie la sortie texte (sans lever d'erreur sur code retour).
function Invoke-Sdb([string[]]$sdbArgs) {
    $sdb = Get-Sdb
    $out = & $sdb @sdbArgs 2>&1 | Out-String
    return $out.Trim()
}

function Connect-Tv([string]$ip) {
    $serial = "${ip}:26101"
    $out = Invoke-Sdb @('connect', $ip)
    Write-Info $out
    $devices = Invoke-Sdb @('devices')
    $line = ($devices -split "`r?`n") | Where-Object { $_ -match [regex]::Escape($serial) } | Select-Object -First 1
    if (-not $line) { return $null }
    $parts = ($line -split '\s+') | Where-Object { $_ }
    if ($parts.Count -lt 2 -or $parts[1] -ne 'device') {
        Write-Warn2 "État sdb : $line"
        return $null
    }
    $name = if ($parts.Count -ge 3) { $parts[2] } else { $serial }
    return @{ Serial = $serial; Name = $name }
}

function Save-State($obj) { $obj | ConvertTo-Json | Set-Content -Path $Script:StateFile -Encoding UTF8 }
function Read-State {
    if (Test-Path $Script:StateFile) { return Get-Content $Script:StateFile -Raw | ConvertFrom-Json }
    return $null
}

function Confirm-Action([string]$question, [switch]$yes) {
    if ($yes) { return $true }
    $a = Read-Host "$question [o/N]"
    return $a -match '^(o|oui|y|yes)$'
}
