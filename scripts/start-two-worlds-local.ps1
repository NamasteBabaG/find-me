$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$pilotDir = Join-Path $projectDir 'storage/two-worlds-bar-20260919'
if (-not (Test-Path -LiteralPath (Join-Path $pilotDir 'game.sqlite'))) { throw 'Assemble the reviewed pilot first.' }
if (Get-NetTCPConnection -LocalPort 3037 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3037 is already occupied; not replacing any server.' }
$env:NODE_ENV = 'development'
$env:APP_ENV = 'development'
$env:APP_URL = 'http://localhost:3037'
$env:DATABASE_URL = 'file:' + (Join-Path $pilotDir 'game.sqlite').Replace('\','/')
$env:STORAGE_LOCAL_DIR = Join-Path $pilotDir 'assets'
$env:STORAGE_PROVIDER = 'local'
$env:GENERATION_PROVIDER = 'mock'
$env:GENERATION_ENABLED = 'off'
$env:PAYMENT_PROVIDER = 'mock'
$env:EMAIL_PROVIDER = 'console'
$env:ANALYTICS_PROVIDER = 'none'
$env:SESSION_SECRET = 'two-worlds-local-only-test-secret'
$env:LOCAL_TWO_WORLD_PREVIEW = '1'
$previewProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/next/dist/bin/next','dev','--port','3037') -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $pilotDir 'server.log') -RedirectStandardError (Join-Path $pilotDir 'server-error.log') -PassThru
Write-Output "Local two-world preview starting on http://localhost:3037 (PID $($previewProcess.Id)); paid generation disabled."
