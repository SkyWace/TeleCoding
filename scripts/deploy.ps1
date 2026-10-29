<#
.SYNOPSIS
    Compile, signe, installe et lance TeleCoding sur la TV Samsung.
.DESCRIPTION
    1. Vérifie la TV (modèle, mode développeur)   5. Installe le .wgt
    2. Connexion sdb (port 26101)                 6. Lance l'appli et vérifie qu'elle est installée
    3. Vérifie le profil de certificat Samsung    7. Explique le démarrage automatique (aucun réglage TV modifié)
    4. Construit et signe le .wgt
.EXAMPLE
    .\scripts\deploy.ps1
    .\scripts\deploy.ps1 -Ip 192.168.1.129 -Profile TeleCoding
    .\scripts\deploy.ps1 -BuildOnly
#>
param(
    [string]$Ip,
    [Alias('Profile')][string]$CertProfile = $env:TELECODING_PROFILE,
    [switch]$BuildOnly
)
. "$PSScriptRoot\common.ps1"
if (-not $Ip) { $Ip = $Script:DefaultIp }

$tizen = Get-TizenCli
$appDir = Join-Path $Script:RepoRoot 'app'
$buildDir = Join-Path $env:TEMP 'telecoding-build'

# --- 1. TV ------------------------------------------------------------------
if (-not $BuildOnly) {
    Write-Step 1 "Vérification de la TV $Ip"
    $d = Get-SamsungInfo $Ip
    if (-not $d) { Fail "La TV ne répond pas sur $Ip. Lance .\scripts\find-tv.ps1 pour la retrouver." }
    Write-Ok ($d.modelName + " · " + $d.OS + " · firmware " + $d.firmwareVersion)
    if ($d.developerMode -ne '1') { Fail "Mode développeur inactif (Applis > 1 2 3 4 5 sur la TV)." }
    Write-Ok ("Mode développeur actif pour l'IP " + $d.developerIP)

    # --- 2. sdb -------------------------------------------------------------
    Write-Step 2 "Connexion sdb"
    $dev = Connect-Tv $Ip
    if (-not $dev) {
        Fail "Connexion sdb impossible. Vérifie l'IP du PC saisie sur la TV, débranche-la 30 s, et autorise sdb.exe dans le pare-feu (réseau privé)."
    }
    Write-Ok ("Connecté à " + $dev.Name + " (" + $dev.Serial + ")")
    $duid = Invoke-Sdb @('-s', $dev.Serial, 'shell', '0', 'getduid')
    if ($duid) { Write-Info "DUID de la TV (à mettre dans le certificat) : $duid" }
}

# --- 3. Certificat ----------------------------------------------------------
Write-Step 3 "Profil de certificat"
$profiles = & $tizen security-profiles list 2>&1 | Out-String
Write-Info ($profiles.Trim() -replace "`r?`n", "`n        ")
if (-not $CertProfile) {
    # Lignes du type « NomDuProfil   O » ; on préfère le profil actif (O).
    $rows = ($profiles -split "`r?`n") | Where-Object { $_ -match '^\s*([A-Za-z0-9_\-\.]+)\s+(O|X)?\s*$' } |
        ForEach-Object { [pscustomobject]@{ Name = $Matches[1]; Active = ($Matches[2] -eq 'O') } }
    $pick = ($rows | Where-Object { $_.Active } | Select-Object -First 1)
    if (-not $pick) { $pick = $rows | Select-Object -First 1 }
    if ($pick) { $CertProfile = $pick.Name }
}
if (-not $CertProfile) {
    Fail ("Aucun profil trouvé. Dans Tizen Studio : Tools > Certificate Manager > + > Samsung > TV, " +
          "connexion au compte Samsung, ajoute le DUID affiché ci-dessus. Puis relance avec -Profile <nom>.")
}
Write-Ok "Profil utilisé : $CertProfile"

# --- 4. Build + signature ---------------------------------------------------
Write-Step 4 "Construction du paquet .wgt"
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
Copy-Item -Recurse $appDir $buildDir
& $tizen build-web -out .buildResult -- $buildDir | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "Échec de tizen build-web." }
& $tizen package -t wgt -s $CertProfile -- (Join-Path $buildDir '.buildResult') | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "Échec de la signature (profil $CertProfile)." }
$wgt = Get-ChildItem (Join-Path $buildDir '.buildResult') -Filter *.wgt | Select-Object -First 1
if (-not $wgt) { Fail "Aucun .wgt produit." }
$dist = Join-Path $Script:RepoRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item $wgt.FullName (Join-Path $dist 'TeleCoding.wgt') -Force
Write-Ok "Paquet : dist\TeleCoding.wgt"
if ($BuildOnly) { exit 0 }

# --- 5. Installation --------------------------------------------------------
Write-Step 5 "Installation sur la TV"
& $tizen install -n 'TeleCoding.wgt' -t $dev.Name -- $dist | Out-Host
if ($LASTEXITCODE -ne 0) {
    Fail "Échec de l'installation. Cause fréquente : le DUID de la TV n'est pas dans le certificat Samsung."
}
Save-State @{ tvIp = $Ip; device = $dev.Name; appId = $Script:AppId; installedAt = (Get-Date).ToString('s') }
Write-Ok "Installée."

# --- 6. Lancement + vérification -------------------------------------------
Write-Step 6 "Lancement et vérification"
& $tizen run -p $Script:AppId -t $dev.Name | Out-Host
if ($LASTEXITCODE -eq 0) { Write-Ok "TeleCoding lancé : regarde la TV." } else { Write-Warn2 "Le lancement a échoué, ouvre TeleCoding depuis Applis." }
$apps = Invoke-Sdb @('-s', $dev.Serial, 'shell', '0', 'applist')
if ($apps -match [regex]::Escape($Script:PackageId)) { Write-Ok "L'appli apparaît dans la liste des applis de la TV." }
else { Write-Warn2 "Impossible de confirmer via « applist » (commande non disponible sur certains firmwares)." }

# --- 7. Démarrage automatique ----------------------------------------------
Write-Step 7 "Démarrage automatique (à faire toi-même, rien n'est modifié par ce script)"
Write-Info "Samsung (Tizen) ne permet pas de remplacer le Smart Hub. La solution compatible :"
Write-Info "  Réglages > Général et confidentialité > Options d'écran de démarrage"
Write-Info "  > activer « Exécution auto. de la dernière appli »."
Write-Info "Ouvre TeleCoding, éteins la TV : elle rouvrira TeleCoding au prochain allumage."
Write-Info "Pour tout annuler : restore-original-home"
