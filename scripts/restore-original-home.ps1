<#
.SYNOPSIS
    Revient à l'état d'origine de la TV : Smart Hub Samsung comme accueil, TeleCoding retiré.
.DESCRIPTION
    TeleCoding ne modifie, ne désactive et ne supprime jamais le Smart Hub ni aucune appli
    Samsung : l'accueil d'origine est toujours là. Ce script :
      1. ferme TeleCoding s'il est ouvert ;
      2. désinstalle TeleCoding (sauf -KeepApp) ;
      3. rappelle les réglages TV à remettre (activés à la main, donc remis à la main).
.EXAMPLE
    restore-original-home              # depuis la racine du dépôt (cmd ou PowerShell : .\restore-original-home)
    .\scripts\restore-original-home.ps1 -KeepApp
    .\scripts\restore-original-home.ps1 -Yes
#>
param(
    [string]$Ip,
    [switch]$KeepApp,
    [switch]$Yes
)
. "$PSScriptRoot\common.ps1"

$state = Read-State
if (-not $Ip) { if ($state -and $state.tvIp) { $Ip = $state.tvIp } else { $Ip = $Script:DefaultIp } }

Write-Host "Restauration de l'accueil d'origine (TV $Ip)" -ForegroundColor Cyan
Write-Info "Le Smart Hub Samsung n'a jamais été modifié : la touche HOME l'ouvre toujours."

$dev = $null
Write-Step 1 "Connexion à la TV"
if (Get-SamsungInfo $Ip) { $dev = Connect-Tv $Ip }
if ($dev) { Write-Ok ("Connecté à " + $dev.Name) }
else { Write-Warn2 "TV injoignable par sdb : je passe aux étapes manuelles." }

if ($dev -and -not $KeepApp) {
    Write-Step 2 "Désinstallation de TeleCoding"
    if (Confirm-Action "Désinstaller TeleCoding de la TV ?" -yes:$Yes) {
        $tizen = Get-TizenCli
        & $tizen uninstall -p $Script:PackageId -t $dev.Name | Out-Host
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "TeleCoding désinstallé."
            if (Test-Path $Script:StateFile) { Remove-Item $Script:StateFile }
        } else {
            Write-Warn2 "La désinstallation a échoué. À la main : Accueil > Applis > Réglages (roue) > TeleCoding > Supprimer."
        }
    } else {
        Write-Info "Appli conservée."
    }
} elseif ($KeepApp) {
    Write-Step 2 "Appli conservée (-KeepApp)"
    if ($dev) { Invoke-Sdb @('-s', $dev.Serial, 'shell', '0', 'kill', $Script:PackageId) | Out-Null }
} else {
    Write-Step 2 "Désinstallation manuelle"
    Write-Info "Accueil > Applis > Réglages (roue dentée) > TeleCoding > Supprimer."
}

Write-Step 3 "Réglages TV à remettre (si tu les avais changés)"
Write-Info "- Démarrage : Réglages > Général et confidentialité > Options d'écran de démarrage"
Write-Info "  > désactiver « Exécution auto. de la dernière appli »  (ou réactiver « Exécution auto. Smart Hub »)."
Write-Info "- Mode développeur (facultatif) : Applis > 1 2 3 4 5 > Off, puis redémarrer la TV."
Write-Host ""
Write-Ok "Terminé : la TV démarre à nouveau sur l'accueil Samsung."
