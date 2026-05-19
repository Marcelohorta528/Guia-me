$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 5510
Write-Host "Pasta: $PSScriptRoot"
Write-Host "Tentando http://localhost:$port/"
Write-Host "Nota: cadastro/login com API precisam de Node — use .\iniciar-com-api.ps1 (porta 3333)."

if (Get-Command python -ErrorAction SilentlyContinue) {
    python -m http.server $port
    exit
}

Write-Host "Python nao encontrado. Abra index.html diretamente no navegador ou instale Python."
Read-Host "Enter para sair"
