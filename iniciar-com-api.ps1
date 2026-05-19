$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Resolve-NodeExe {
    $fromPath = Get-Command node -ErrorAction SilentlyContinue
    if ($fromPath -and $fromPath.Source) {
        return $fromPath.Source
    }
    $candidates = @(
        (Join-Path $env:ProgramFiles "nodejs\node.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"),
        (Join-Path $env:ProgramFiles "Node.js\node.exe")
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) {
            return $p
        }
    }
    if ($env:NVM_SYMLINK) {
        $nvmLink = Join-Path $env:NVM_SYMLINK "node.exe"
        if (Test-Path -LiteralPath $nvmLink) {
            return $nvmLink
        }
    }
    return $null
}

$nodeExe = Resolve-NodeExe
if (-not $nodeExe) {
    Write-Host "Node.js nao encontrado no PATH nem em Program Files."
    Write-Host "Instale Node 18+ (https://nodejs.org) ou use nvm-windows e confirme que 'node' funciona no terminal."
    exit 1
}

Write-Host "Usando: $nodeExe"
Write-Host "API em http://localhost:3333 (Ctrl+C para parar)"
& $nodeExe .\server\index.mjs
