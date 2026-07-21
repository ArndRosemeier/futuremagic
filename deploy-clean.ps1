# Futuremagic hub - deploy to domain root on futuremagic.de
# Uploads hub files into /webseiten/ WITHOUT wiping app subfolders
# (Expert/, LlmTable/, ColossusWeb/, ...).

param(
    [string]$RemotePath = "/webseiten/",
    [string]$PublicUrl = "https://futuremagic.de/",
    [string]$FtpServer = "ftp.futuremagic.de",
    [string]$FtpUser = "12529-Pyrion"
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$DistDir = Join-Path $RepoRoot "dist"

# Subdirectory names that must never be deleted by this hub deploy
$ProtectedDirs = @("Expert", "LlmTable", "ColossusWeb")

function Normalize-FtpDir([string]$p) {
    if (-not $p.StartsWith("/")) { $p = "/$p" }
    if (-not $p.EndsWith("/")) { $p = "$p/" }
    return $p
}

function Get-FtpCredential([string]$Password) {
    return New-Object System.Net.NetworkCredential($FtpUser, $Password)
}

function List-FtpDirectoryDetails([string]$RemoteDir, [string]$Password) {
    $request = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemoteDir")
    $request.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails
    $request.Credentials = Get-FtpCredential $Password
    $request.UsePassive = $true
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try {
            $lines = @()
            while ($null -ne ($line = $reader.ReadLine())) {
                $lines += $line
            }
            return $lines
        } finally {
            $reader.Close()
        }
    } finally {
        $response.Close()
    }
}

function Parse-FtpName([string]$line) {
    # Prefer Unix-style listing: permissions ... name
    $parts = $line -split '\s+', 9
    if ($parts.Length -ge 9) {
        return $parts[8]
    }
    # Windows-style: date time <DIR>|size name
    $parts = $line -split '\s+', 4
    if ($parts.Length -ge 4) {
        return $parts[3]
    }
    return $line.Trim()
}

function Test-FtpIsDirectory([string]$line) {
    if ($line.StartsWith("d")) { return $true }
    if ($line -match '<DIR>') { return $true }
    return $false
}

function Upload-FtpFile([string]$LocalFile, [string]$RemoteFile, [string]$Password) {
    $bytes = [System.IO.File]::ReadAllBytes($LocalFile)
    $request = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemoteFile")
    $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $request.Credentials = Get-FtpCredential $Password
    $request.UseBinary = $true
    $request.UsePassive = $true
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try {
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Close()
    }
    $response = $request.GetResponse()
    $response.Close()
}

function Remove-FtpFile([string]$RemoteFile, [string]$Password) {
    $request = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemoteFile")
    $request.Method = [System.Net.WebRequestMethods+Ftp]::DeleteFile
    $request.Credentials = Get-FtpCredential $Password
    $request.UsePassive = $true
    $response = $request.GetResponse()
    $response.Close()
}

function Ensure-FtpDirectory([string]$RemoteDir, [string]$Password) {
    $request = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemoteDir")
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = Get-FtpCredential $Password
    $request.UsePassive = $true
    try {
        $response = $request.GetResponse()
        $response.Close()
    } catch {
        # Already exists - ignore
    }
}

$RemotePath = Normalize-FtpDir $RemotePath

Write-Host "Futuremagic hub deployment" -ForegroundColor Cyan
Write-Host "Remote: ftp://$FtpServer$RemotePath" -ForegroundColor Yellow
Write-Host "Public: $PublicUrl" -ForegroundColor Yellow
Write-Host "Protected app dirs: $($ProtectedDirs -join ', ')" -ForegroundColor Gray

try {
    Write-Host "Cleaning local dist..." -ForegroundColor Yellow
    if (Test-Path $DistDir) {
        Remove-Item -Recurse -Force $DistDir
    }

    Write-Host "Building hub..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE"
    }

    if (-not (Test-Path (Join-Path $DistDir "index.html"))) {
        throw "Build failed - no index.html in dist"
    }
    if (-not (Test-Path (Join-Path $DistDir "apps.json"))) {
        throw "Build failed - no apps.json in dist (expected from public/)"
    }

    $FTP_PASSWORD = $env:FTP_PASSWORD
    if (-not $FTP_PASSWORD) {
        $FTP_PASSWORD = [Environment]::GetEnvironmentVariable("FTP_PASSWORD", "User")
    }
    if (-not $FTP_PASSWORD) {
        $secure = Read-Host "FTP password for $FtpUser" -AsSecureString
        $FTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        )
    }
    if (-not $FTP_PASSWORD) {
        throw "FTP password required (set `$env:FTP_PASSWORD)"
    }

    Write-Host ""
    Write-Host "=== Verifying FTP root ===" -ForegroundColor Cyan
    $listing = List-FtpDirectoryDetails $RemotePath $FTP_PASSWORD
    $names = @()
    foreach ($line in $listing) {
        $name = Parse-FtpName $line
        if ($name -and $name -ne "." -and $name -ne "..") {
            $names += $name
            $kind = if (Test-FtpIsDirectory $line) { "dir" } else { "file" }
            Write-Host ("  [{0}] {1}" -f $kind, $name) -ForegroundColor Gray
        }
    }

    $foundApps = @($ProtectedDirs | Where-Object { $names -contains $_ })
    if ($foundApps.Count -eq 0) {
        Write-Host ""
        Write-Host "WARNING: None of the known app folders were found under $RemotePath" -ForegroundColor Yellow
        Write-Host "If the domain root lives elsewhere, abort and adjust -RemotePath." -ForegroundColor Yellow
        $confirm = Read-Host "Continue uploading hub files to $RemotePath anyway? (y/N)"
        if ($confirm -ne "y" -and $confirm -ne "Y") {
            throw "Aborted - verify FTP document root first"
        }
    } else {
        Write-Host ("Found app folders: {0}" -f ($foundApps -join ", ")) -ForegroundColor Green
    }

    # Collect local files to upload (relative posix paths)
    $distResolved = (Resolve-Path $DistDir).Path
    $localFiles = Get-ChildItem -Path $DistDir -Recurse -File
    $uploadMap = @{}
    foreach ($file in $localFiles) {
        $rel = $file.FullName.Substring($distResolved.Length).TrimStart([char]'\', [char]'/').Replace('\', '/')
        $uploadMap[$rel] = $file.FullName
    }

    # Ensure assets/ and shots/ exist
    Ensure-FtpDirectory "${RemotePath}assets/" $FTP_PASSWORD
    Ensure-FtpDirectory "${RemotePath}shots/" $FTP_PASSWORD

    Write-Host ""
    Write-Host "=== Uploading hub files ===" -ForegroundColor Cyan
    $uploaded = 0
    $skipAppsJson = $names -contains "apps.json"
    if ($skipAppsJson) {
        Write-Host "  (keeping existing remote apps.json - not overwriting registry)" -ForegroundColor Gray
    }

    foreach ($rel in ($uploadMap.Keys | Sort-Object)) {
        $remoteFile = "$RemotePath$rel"
        # Never overwrite protected app trees
        $top = ($rel -split '/')[0]
        if ($ProtectedDirs -contains $top) {
            Write-Host "[SKIP] refusing to upload into protected dir: $rel" -ForegroundColor Yellow
            continue
        }
        if ($rel -eq "apps.json" -and $skipAppsJson) {
            Write-Host "[SKIP] apps.json (remote registry already present)" -ForegroundColor Yellow
            continue
        }
        Write-Host "  ^ $rel" -ForegroundColor White
        Upload-FtpFile $uploadMap[$rel] $remoteFile $FTP_PASSWORD
        $uploaded++
    }

    # Remove stale hashed assets that are no longer in this build
    Write-Host ""
    Write-Host "=== Cleaning stale hub assets ===" -ForegroundColor Cyan
    $assetsRemote = "${RemotePath}assets/"
    try {
        $assetListing = List-FtpDirectoryDetails $assetsRemote $FTP_PASSWORD
        $wantedAssets = @{}
        foreach ($rel in $uploadMap.Keys) {
            if ($rel.StartsWith("assets/")) {
                $wantedAssets[$rel.Substring("assets/".Length)] = $true
            }
        }
        foreach ($line in $assetListing) {
            if (Test-FtpIsDirectory $line) { continue }
            $name = Parse-FtpName $line
            if (-not $name -or $name -eq "." -or $name -eq "..") { continue }
            if (-not $wantedAssets.ContainsKey($name)) {
                Write-Host "  x assets/$name (stale)" -ForegroundColor DarkYellow
                Remove-FtpFile "$assetsRemote$name" $FTP_PASSWORD
            }
        }
    } catch {
        Write-Host "  (assets listing skipped: $($_.Exception.Message))" -ForegroundColor Gray
    }

    # Push curated manifesto files into each app folder (screenshot paths, taglines)
    Write-Host ""
    Write-Host "=== Syncing app manifestos ===" -ForegroundColor Cyan
    $manifestoRoot = Join-Path $RepoRoot "seed\manifestos"
    if (Test-Path $manifestoRoot) {
        foreach ($appName in $ProtectedDirs) {
            $localManifesto = Join-Path $manifestoRoot "$appName.json"
            if (Test-Path $localManifesto) {
                $remoteManifesto = "${RemotePath}$appName/futuremagic.json"
                Write-Host "  ^ $appName/futuremagic.json" -ForegroundColor White
                Upload-FtpFile $localManifesto $remoteManifesto $FTP_PASSWORD
                $uploaded++
            }
        }
    }

    Write-Host ""
    Write-Host "Hub deployment finished. Uploaded $uploaded files." -ForegroundColor Green
    Write-Host "Site: $PublicUrl" -ForegroundColor Cyan
    Write-Host "Registry: ${PublicUrl}apps.json" -ForegroundColor Cyan
} catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
