$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-GitRead {
    param(
        [Parameter(Mandatory = $true)] [string] $WorkDir,
        [Parameter(Mandatory = $true)] [string[]] $Arguments
    )

    if (-not (Test-Path -LiteralPath $WorkDir)) {
        return $null
    }

    $output = & git -C $WorkDir @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return ($output -join "`n").Trim()
}

function Get-StatusLabel {
    param([AllowNull()] [string] $StatusOutput)

    if ($null -eq $StatusOutput) {
        return 'NAO DISPONIVEL'
    }

    if ([string]::IsNullOrWhiteSpace($StatusOutput)) {
        return 'LIMPO'
    }

    return 'SUJO'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..')).Path
$configPath = Join-Path $repoRoot 'ops\release-management\current-production.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

$protectedSource = $config.protected_source_path
$artifactPath = $config.published_artifact_path

$protectedHead = Invoke-GitRead -WorkDir $protectedSource -Arguments @('rev-parse', 'HEAD')
$protectedStatusRaw = Invoke-GitRead -WorkDir $protectedSource -Arguments @('status', '--porcelain=v1', '-uall')
$protectedStatus = Get-StatusLabel -StatusOutput $protectedStatusRaw

$devBranch = Invoke-GitRead -WorkDir $repoRoot -Arguments @('branch', '--show-current')
$devHead = Invoke-GitRead -WorkDir $repoRoot -Arguments @('rev-parse', 'HEAD')
$devStatusRaw = Invoke-GitRead -WorkDir $repoRoot -Arguments @('status', '--porcelain=v1', '-uall')
$devStatus = Get-StatusLabel -StatusOutput $devStatusRaw

$artifactExists = Test-Path -LiteralPath $artifactPath
$artifactSize = $null
if ($artifactExists) {
    $artifactSize = (Get-Item -LiteralPath $artifactPath).Length
}

$divergences = @()
if ($protectedHead -ne $config.commit) {
    $divergences += "PROD registrada e copia protegida nao coincidem: registrado $($config.commit), copia $protectedHead"
}
if ($protectedStatus -ne 'LIMPO') {
    $divergences += "Copia protegida esta $protectedStatus"
}
if (-not $artifactExists) {
    $divergences += "Artefato Netlify nao encontrado em $artifactPath"
}

Write-Output "Produto: $($config.product)"
Write-Output "URL de producao: $($config.production_url)"
Write-Output "Commit registrado como PROD: $($config.commit)"
Write-Output "Branch registrada como PROD: $($config.branch)"
Write-Output "Caminho do codigo-fonte protegido: $protectedSource"
Write-Output "Commit efetivo da copia protegida: $protectedHead"
Write-Output "Status da copia protegida: $protectedStatus"
Write-Output "Caminho do artefato Netlify: $artifactPath"
Write-Output "Artefato Netlify existe: $artifactExists"
Write-Output "Tamanho do artefato Netlify: $artifactSize"
Write-Output "Branch do DEV: $devBranch"
Write-Output "Commit do DEV: $devHead"
Write-Output "Status do DEV: $devStatus"

if ($divergences.Count -eq 0) {
    Write-Output "Divergencias: nenhuma critica"
} else {
    Write-Output "Divergencias:"
    foreach ($item in $divergences) {
        Write-Output "- $item"
    }
}
