# Publicar Guia-me Service no GitHub + instruções Render
# Execute no PowerShell:  .\publicar-guia-me.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$DeployDir = Join-Path $env:USERPROFILE "guia-me-service-deploy"
$Git = "C:\Program Files\Git\bin\git.exe"
$Gh = "C:\Program Files\GitHub CLI\gh.exe"
$RepoName = "guia-me-service"

function Ensure-Tool($path, $wingetId, $name) {
  if (Test-Path $path) { return $path }
  Write-Host "A instalar $name..." -ForegroundColor Yellow
  winget install --id $wingetId -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
  if (-not (Test-Path $path)) { throw "Não foi possível instalar $name." }
  return $path
}

$Git = Ensure-Tool $Git "Git.Git" "Git"
$Gh = Ensure-Tool $Gh "GitHub.cli" "GitHub CLI"

Write-Host "`n=== 1. Copiar projeto para pasta de deploy ===" -ForegroundColor Cyan
if (Test-Path $DeployDir) { Remove-Item -Recurse -Force $DeployDir }
New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null
robocopy $ProjectRoot $DeployDir /E /XD .git node_modules /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Erro ao copiar ficheiros (robocopy $LASTEXITCODE)" }

Set-Location $DeployDir
if (Test-Path .git) { Remove-Item -Recurse -Force .git }
& $Git init | Out-Null
& $Git add .
& $Git -c user.email="deploy@guia-me.local" -c user.name="Guia-me Deploy" commit -m "Guia-me Service MVP — deploy Render" | Out-Null
& $Git branch -M main

Write-Host "`n=== 2. Login GitHub (abre o browser) ===" -ForegroundColor Cyan
$auth = & $Gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Siga os passos no browser para autorizar o GitHub CLI." -ForegroundColor Yellow
  & $Gh auth login -h github.com -p https -w
}

Write-Host "`n=== 3. Criar repositório e enviar código ===" -ForegroundColor Cyan
$owner = (& $Gh api user -q .login).Trim()
$remote = "https://github.com/$owner/$RepoName.git"
$exists = & $Gh repo view "$owner/$RepoName" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $Gh repo create $RepoName --public --source . --remote origin --push --description "Guia-me Service MVP — cliente, prestador, API Node"
} else {
  & $Git remote remove origin 2>$null
  & $Git remote add origin $remote
  & $Git push -u origin main --force
}
Write-Host "Repositório: https://github.com/$owner/$RepoName" -ForegroundColor Green

Write-Host "`n=== 4. Render (hospedagem grátis HTTPS) ===" -ForegroundColor Cyan
Write-Host @"

1. Abra: https://dashboard.render.com/
2. New → Blueprint (ou Web Service)
3. Ligue o repositório: $owner/$RepoName
4. Se usar Blueprint, o Render lê o ficheiro render.yaml
5. Aguarde o deploy (estado Live)

URLs para partilhar (substitua pelo seu domínio Render):
  https://SEU-APP.onrender.com/
  https://SEU-APP.onrender.com/cliente/
  https://SEU-APP.onrender.com/prestador/

"@ -ForegroundColor White

$open = Read-Host "Abrir o Render no browser agora? (s/n)"
if ($open -eq "s") { Start-Process "https://dashboard.render.com/blueprint/new" }

Write-Host "`nConcluído. Pasta local do git: $DeployDir" -ForegroundColor Green
