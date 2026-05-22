# Cola todas as atualizações do projeto na pasta de backup em Documentos.
# Uso: .\atualizar-pasta-documentos.ps1

$ErrorActionPreference = "Stop"
$Origem = $PSScriptRoot
$Destino = Join-Path $env:USERPROFILE "Documents\Guia-me-Service-backup-2026-05-21"

if (-not (Test-Path $Origem)) {
  throw "Pasta de origem não encontrada: $Origem"
}

New-Item -ItemType Directory -Path $Destino -Force | Out-Null

Write-Host "A sincronizar..." -ForegroundColor Cyan
Write-Host "  De:  $Origem"
Write-Host "  Para: $Destino"

robocopy $Origem $Destino /MIR /XD node_modules /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Erro ao copiar (robocopy código $LASTEXITCODE)"
}

$count = (Get-ChildItem -Path $Destino -Recurse -File).Count
Write-Host "Concluído: $count ficheiros em Documentos." -ForegroundColor Green
