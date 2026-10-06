# Set-FuturemagicAppTier.ps1
# Changes the hub tier of an already-registered app in https://futuremagic.de/apps.json
# without redeploying the app. All other fields and apps are left untouched.
#
# Tiers:
#   hero    - large showcase banner at the top; reads the extended manifesto
#             (description, screenshots, highlights, links, cta)
#   normal  - regular card (default; stored as "no tier")
#   further - compact list at the bottom
#
# Usage:
#   & "C:\Projekte\Futuremagic\scripts\Set-FuturemagicAppTier.ps1" `
#       -Slug "ArmchairGeneral" -Tier hero -FtpPassword $FTP_PASSWORD

param(
    [Parameter(Mandatory = $true)]
    [string]$Slug,

    [Parameter(Mandatory = $true)]
    [ValidateSet("hero", "normal", "further")]
    [string]$Tier,

    [Parameter(Mandatory = $true)]
    [string]$FtpPassword,

    [string]$FtpServer = "ftp.futuremagic.de",
    [string]$FtpUser = "12529-Pyrion",
    [string]$RegistryRemotePath = "/webseiten/apps.json"
)

$ErrorActionPreference = "Stop"

function Get-FtpCredential([string]$User, [string]$Password) {
    return New-Object System.Net.NetworkCredential($User, $Password)
}

function Download-FtpText([string]$RemoteUrl, [string]$User, [string]$Password) {
    $request = [System.Net.FtpWebRequest]::Create($RemoteUrl)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::DownloadFile
    $request.Credentials = Get-FtpCredential $User $Password
    $request.UseBinary = $true
    $request.UsePassive = $true
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [System.Text.Encoding]::UTF8)
        try {
            return $reader.ReadToEnd()
        } finally {
            $reader.Close()
        }
    } finally {
        $response.Close()
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

$registryUrl = "ftp://$FtpServer$RegistryRemotePath"
Write-Host "Setting tier of '$Slug' to '$Tier'..." -ForegroundColor Cyan

$raw = Download-FtpText $registryUrl $FtpUser $FtpPassword
$registry = $raw | ConvertFrom-Json
$apps = @($registry.apps)

$target = $apps | Where-Object { $null -ne $_ -and [string]$_.slug -eq $Slug } | Select-Object -First 1
if ($null -eq $target) {
    $known = ($apps | ForEach-Object { [string]$_.slug }) -join ", "
    throw "App '$Slug' is not registered. Known slugs: $known"
}

# "normal" is the default and is stored as the absence of a tier
$target.PSObject.Properties.Remove("tier")
if ($Tier -ne "normal") {
    $target | Add-Member -NotePropertyName tier -NotePropertyValue $Tier
}

$outObj = [ordered]@{
    version = if ($null -ne $registry.version) { $registry.version } else { 1 }
    apps    = $apps
}
$json = ($outObj | ConvertTo-Json -Depth 6) + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
Upload-FtpBytes $registryUrl ($utf8NoBom.GetBytes($json)) $FtpUser $FtpPassword

Write-Host "[OK] apps.json updated ($Slug, tier=$Tier)" -ForegroundColor Green
