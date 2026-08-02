# Register-FuturemagicApp.ps1
# Upserts an app into https://futuremagic.de/apps.json on DomainFactory FTP.
# Optionally uploads a local futuremagic.json manifesto next to the app.
#
# Usage (from an app deploy script):
#   & "C:\Projekte\Futuremagic\scripts\Register-FuturemagicApp.ps1" `
#       -Slug "LlmTable" `
#       -Title "LlmTable" `
#       -Path "/LlmTable/" `
#       -FtpPassword $FTP_PASSWORD `
#       -ManifestoLocalPath "apps\web\dist\futuremagic.json"

param(
    [Parameter(Mandatory = $true)]
    [string]$Slug,

    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$FtpPassword,

    [string]$FtpServer = "ftp.futuremagic.de",
    [string]$FtpUser = "12529-Pyrion",
    [string]$RegistryRemotePath = "/webseiten/apps.json",
    [string]$ManifestoLocalPath = "",
    [string]$AppRemoteDir = ""
)

$ErrorActionPreference = "Stop"

function Normalize-AppPath([string]$p) {
    if (-not $p.StartsWith("/")) { $p = "/$p" }
    if (-not $p.EndsWith("/")) { $p = "$p/" }
    return $p
}

function Get-FtpCredential([string]$User, [string]$Password) {
    return New-Object System.Net.NetworkCredential($User, $Password)
}

function Download-FtpText([string]$RemoteUrl, [string]$User, [string]$Password) {
    $request = [System.Net.FtpWebRequest]::Create($RemoteUrl)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::DownloadFile
    $request.Credentials = Get-FtpCredential $User $Password
    $request.UseBinary = $true
    $request.UsePassive = $true
    try {
        $response = $request.GetResponse()
        try {
            $stream = $response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
            try {
                return $reader.ReadToEnd()
            } finally {
                $reader.Close()
            }
        } finally {
            $response.Close()
        }
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($resp -is [System.Net.FtpWebResponse] -and $resp.StatusCode -eq [System.Net.FtpStatusCode]::ActionNotTakenFileUnavailable) {
            return $null
        }
        throw
    }
}

function Upload-FtpBytes([string]$RemoteUrl, [byte[]]$Bytes, [string]$User, [string]$Password) {
    $request = [System.Net.FtpWebRequest]::Create($RemoteUrl)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $request.Credentials = Get-FtpCredential $User $Password
    $request.UseBinary = $true
    $request.UsePassive = $true
    $request.ContentLength = $Bytes.Length
    $stream = $request.GetRequestStream()
    try {
        $stream.Write($Bytes, 0, $Bytes.Length)
    } finally {
        $stream.Close()
    }
    $response = $request.GetResponse()
    $response.Close()
}

function Upload-FtpFile([string]$LocalPath, [string]$RemoteUrl, [string]$User, [string]$Password) {
    $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
    Upload-FtpBytes $RemoteUrl $bytes $User $Password
}

$Path = Normalize-AppPath $Path
$updatedAt = (Get-Date).ToUniversalTime().ToString("o")

Write-Host "Registering Futuremagic app '$Slug'..." -ForegroundColor Cyan
Write-Host "  path: $Path" -ForegroundColor Gray
Write-Host "  registry: ftp://$FtpServer$RegistryRemotePath" -ForegroundColor Gray

$registryUrl = "ftp://$FtpServer$RegistryRemotePath"
$raw = Download-FtpText $registryUrl $FtpUser $FtpPassword

if ($null -eq $raw -or $raw.Trim().Length -eq 0) {
    $registry = [ordered]@{
        version = 1
        apps    = @()
    }
} else {
    $registry = $raw | ConvertFrom-Json
    if ($null -eq $registry.apps) {
        $registry | Add-Member -NotePropertyName apps -NotePropertyValue @() -Force
    }
    if ($null -eq $registry.version) {
        $registry | Add-Member -NotePropertyName version -NotePropertyValue 1 -Force
    }
}

$appsList = @($registry.apps)
$found = $false
$newApps = @()

foreach ($app in $appsList) {
    if ($null -ne $app -and [string]$app.slug -eq $Slug) {
        $entry = [ordered]@{
            slug      = $Slug
            title     = $Title
            path      = $Path
            updatedAt = $updatedAt
        }
        if ($null -ne $app.external) {
            $entry.external = [bool]$app.external
        }
        if ($null -ne $app.url -and [string]$app.url.Length -gt 0) {
            $entry.url = [string]$app.url
        }
        # manifesto flag set after we know whether upload succeeds
        $newApps += $entry
        $found = $true
    } elseif ($null -ne $app) {
        $entry = [ordered]@{
            slug      = [string]$app.slug
            title     = [string]$app.title
            path      = Normalize-AppPath ([string]$app.path)
            updatedAt = [string]$app.updatedAt
        }
        if ($null -ne $app.external) {
            $entry.external = [bool]$app.external
        }
        if ($null -ne $app.url -and [string]$app.url.Length -gt 0) {
            $entry.url = [string]$app.url
        }
        if ($null -ne $app.manifesto) {
            $entry.manifesto = [bool]$app.manifesto
        }
        $newApps += $entry
    }
}

if (-not $found) {
    $newApps += [ordered]@{
        slug      = $Slug
        title     = $Title
        path      = $Path
        updatedAt = $updatedAt
    }
}

$hasManifestoFile = ($ManifestoLocalPath -ne "" -and (Test-Path $ManifestoLocalPath))
$manifestoFlag = [bool]$hasManifestoFile

# Stamp manifesto flag on the app we just upserted
$stamped = @()
foreach ($app in $newApps) {
    if ([string]$app.slug -eq $Slug) {
        $entry = [ordered]@{
            slug      = [string]$app.slug
            title     = [string]$app.title
            path      = [string]$app.path
            updatedAt = [string]$app.updatedAt
        }
        if ($null -ne $app.external) {
            $entry.external = [bool]$app.external
        }
        if ($null -ne $app.url -and [string]$app.url.Length -gt 0) {
            $entry.url = [string]$app.url
        }
        $entry.manifesto = $manifestoFlag
        $stamped += $entry
    } else {
        $stamped += $app
    }
}
$newApps = $stamped

$outObj = [ordered]@{
    version = 1
    apps    = @($newApps)
}
$json = ($outObj | ConvertTo-Json -Depth 6) + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$bytes = $utf8NoBom.GetBytes($json)
Upload-FtpBytes $registryUrl $bytes $FtpUser $FtpPassword
Write-Host "[OK] apps.json updated ($Slug, manifesto=$manifestoFlag)" -ForegroundColor Green

if ($hasManifestoFile) {
    if ($AppRemoteDir -eq "") {
        $AppRemoteDir = "/webseiten$Path"
    }
    if (-not $AppRemoteDir.EndsWith("/")) {
        $AppRemoteDir = "$AppRemoteDir/"
    }
    # Ensure the app directory exists (register can run before first content upload).
    $parts = $AppRemoteDir.Trim('/').Split('/', [StringSplitOptions]::RemoveEmptyEntries)
    $current = "/"
    foreach ($part in $parts) {
        $current = "$current$part/"
        try {
            $mkdir = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$current")
            $mkdir.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
            $mkdir.Credentials = Get-FtpCredential $FtpUser $FtpPassword
            $mkdir.UsePassive = $true
            $mkdirResp = $mkdir.GetResponse()
            $mkdirResp.Close()
            Write-Host "Created directory: $current" -ForegroundColor Blue
        } catch {
            # Already exists, or parent missing - continue; upload will fail loudly if needed.
        }
    }
    try {
        $manifestoRemote = "ftp://$FtpServer$($AppRemoteDir)futuremagic.json"
        Upload-FtpFile $ManifestoLocalPath $manifestoRemote $FtpUser $FtpPassword
        Write-Host "[OK] futuremagic.json uploaded to $AppRemoteDir" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] apps.json registered, but manifesto upload failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} elseif ($ManifestoLocalPath -ne "") {
    Write-Host "[SKIP] Manifesto not found: $ManifestoLocalPath" -ForegroundColor Yellow
}

Write-Host "Registration complete." -ForegroundColor Green
