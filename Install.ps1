$ErrorActionPreference='Stop'
$node=Get-Command node -ErrorAction Stop
if ((& $node.Source -p 'process.versions.node.match(/^[0-9]+/)[0]') -ne '24') { throw 'Node.js 24 is required' }
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$tools=Join-Path $env:LOCALAPPDATA 'FamilyLedgerUpdater'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
$client=Join-Path $tools 'client.cjs'
$temp=Join-Path $tools ('client-'+[Guid]::NewGuid().ToString('N')+'.tmp')
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/kimdaeyeoun-bit/petvoice-app/family-ledger-updates/client.cjs' -OutFile $temp
if ((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'e46f949a627c18785ffc5962e19e5f62621ffae22f93a600b9c0fdbbc6f81da8') { Remove-Item -LiteralPath $temp; throw 'Updater checksum mismatch' }
Move-Item -LiteralPath $temp -Destination $client -Force
$desktop=[Environment]::GetFolderPath('Desktop')
$lines=@('@echo off','chcp 65001 >nul',('node "'+$client+'"'),'pause')
[IO.File]::WriteAllText((Join-Path $desktop 'Update-FamilyLedger.cmd'),(($lines -join [Environment]::NewLine)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
$runner=Join-Path $tools 'Run-Update.ps1'
$runnerLines=@('$ErrorActionPreference=''Continue''',('$log=Join-Path $PSScriptRoot ''update.log'''),('& node "'+$client+'" >> $log 2>&1'),'exit $LASTEXITCODE')
[IO.File]::WriteAllText($runner,($runnerLines -join [Environment]::NewLine),(New-Object Text.UTF8Encoding($true)))
try {
 $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "'+$runner+'"')
 $trigger=New-ScheduledTaskTrigger -Daily -At '04:00'
 $taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
 $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
 Register-ScheduledTask -TaskName 'FamilyLedger-Update' -Action $action -Trigger $trigger -Settings $taskSettings -Principal $principal -Force | Out-Null
 Write-Host 'Daily 04:00 update check registered. Windows must be awake and this user signed in.'
} catch { Write-Warning 'Daily task could not be registered. Desktop manual updater is installed; see Task Scheduler.' }
Write-Host 'Installed desktop updater: Update-FamilyLedger.cmd'

& $node.Source $client
if ($LASTEXITCODE -ne 0) { throw 'Update needs attention; read the message above. Existing backups are retained.' }
