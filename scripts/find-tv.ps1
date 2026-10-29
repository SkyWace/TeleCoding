<#
.SYNOPSIS
    Trouve la TV Samsung sur le réseau local et affiche son modèle, Tizen et l'état du mode développeur.
.EXAMPLE
    .\scripts\find-tv.ps1                 # teste 192.168.1.129 puis scanne le réseau si besoin
    .\scripts\find-tv.ps1 -Ip 192.168.1.50
    .\scripts\find-tv.ps1 -Scan           # force le scan du /24
#>
param(
    [string]$Ip,
    [switch]$Scan
)
. "$PSScriptRoot\common.ps1"

function Show-Tv($ip, $d) {
    $locals = Get-LocalIPv4
    Write-Ok "TV Samsung trouvée : $ip"
    Write-Info ("Nom          : " + $d.name)
    Write-Info ("Modèle       : " + $d.modelName)
    Write-Info ("Système      : " + $d.OS + " (firmware " + $d.firmwareVersion + ")")
    Write-Info ("Résolution   : " + $d.resolution)
    if ($d.developerMode -eq '1') {
        Write-Ok ("Mode développeur ACTIF, IP autorisée : " + $d.developerIP)
        if ($locals -notcontains $d.developerIP) {
            Write-Warn2 ("Cette IP n'est pas celle de ce PC (" + ($locals -join ', ') + "). Corrige-la dans Applis > 12345 sur la TV.")
        }
    } else {
        Write-Warn2 "Mode développeur INACTIF. Sur la TV : Applis, tape 1 2 3 4 5, active-le avec l'IP de ce PC, puis débranche la TV 30 s."
    }
}

$candidates = @()
if ($Ip) { $candidates = @($Ip) } elseif (-not $Scan) { $candidates = @($Script:DefaultIp) }

foreach ($c in $candidates) {
    Write-Step 1 "Test de $c"
    $d = Get-SamsungInfo $c
    if ($d) { Show-Tv $c $d; exit 0 }
    Write-Warn2 "Pas de TV Samsung qui répond sur $c (port 8001)."
}

Write-Step 2 "Scan du réseau local (port 8001)"
$prefixes = Get-LocalIPv4 | Where-Object { $_ -match '^(10|172|192)\.' } |
    ForEach-Object { ($_ -split '\.')[0..2] -join '.' } | Select-Object -Unique
$found = 0
foreach ($p in $prefixes) {
    Write-Info "Réseau $p.0/24 ..."
    $tasks = @{}
    1..254 | ForEach-Object {
        $client = New-Object System.Net.Sockets.TcpClient
        $tasks["$p.$_"] = @{ Client = $client; Task = $client.ConnectAsync("$p.$_", 8001) }
    }
    Start-Sleep -Milliseconds 1500
    foreach ($k in $tasks.Keys) {
        $t = $tasks[$k]
        $open = $t.Task.IsCompleted -and -not $t.Task.IsFaulted -and $t.Client.Connected
        $t.Client.Close()
        if ($open) {
            $d = Get-SamsungInfo $k
            if ($d) { Show-Tv $k $d; $found++ }
        }
    }
}
if (-not $found) {
    Fail "Aucune TV Samsung trouvée. Vérifie que la TV est allumée et sur le même Wi-Fi que ce PC."
}
