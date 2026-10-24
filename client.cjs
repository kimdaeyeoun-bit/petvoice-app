'use strict';
// Windows update client. It never uploads the ledger, passwords, or tokens.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const CHANNEL='https://raw.githubusercontent.com/kimdaeyeoun-bit/petvoice-app/family-ledger-updates/channel.json';
const PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA304DCkCbQRxNdXFDdgbn\nRNRoH52qMdpNb27rvovPlfAt2DAe6wJnsrnzGovwkwwj9mZZKXamRthBehzJAINe\nr2YXh82shT4XATR0N3Tx0mWcyL9Xp0qCCWLXV56gziAmPClBSEfJBC4GRTZI9HZt\ntLpIBXlWvKWUsf3R1IxUAHA6NdXqMePE5NczBLLPLkYP4BqA7QrYVQMEQMo15KSb\nHI5coAg8qeqh7D3+Yw85ly4uoOhNyGvq2E7II2zK4+kwonbMoEC81Xeu/oLUVZ2m\nesNbgWwxk5GKozGVoUW/fVslRqeziFuFtWerc1LZeXDoJRUGDok2dfbLCmrPCYr4\n4QS10B7U0pEXgAOpYOnMFSVODE1vNoy+RbH49/iiQ/pmtgZiQljfBQgb9b6i5Net\ncoLcYBuzK53iJQu3OQYk+Sc4aAkIUYPhfCYhiKiROvboUl5GPoH/3a2MpAZL2zr2\nb//ew/qtdYOXVLhaGoMp1p/j3jl4kSjWOdBiFVZ49cRFAgMBAAE=\n-----END PUBLIC KEY-----\n";
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function verifyChannel(envelope,key=PUBLIC_KEY){const r=envelope?.release;if(!r||!Number.isSafeInteger(r.version)||r.version<1||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||typeof envelope.signature!=='string')throw Error('Invalid update manifest');const base='https://raw.githubusercontent.com/kimdaeyeoun-bit/petvoice-app/family-ledger-updates/releases/'+r.version+'/';if(r.url!==base+'FamilyLedger-Update.zip')throw Error('Unexpected update source');if(!crypto.verify('RSA-SHA256',Buffer.from(JSON.stringify(r)),key,Buffer.from(envelope.signature,'base64')))throw Error('Update signature verification failed');return r;}
async function download(url,limit){const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('Update download failed: HTTP '+r.status);const chunks=[];let n=0;for await(const b of r.body){n+=b.length;if(n>limit)throw Error('Update exceeds download size limit');chunks.push(b);}return Buffer.concat(chunks);}
function verifyPayload(b,release){if(sha(b)!==release.sha256)throw Error('Update checksum mismatch');}
function compareVersion(version,installed){if(!Number.isSafeInteger(version)||!Number.isSafeInteger(installed)||version<1||installed<0)throw Error('Invalid installed version');if(version<installed)throw Error('Older update refused');return version>installed;}
const DRIVER=String.raw`param([Parameter(Mandatory=$true)][string]$InstallPath,[Parameter(Mandatory=$true)][string]$ZipPath,[Parameter(Mandatory=$true)][string]$ReleasePath)
$ErrorActionPreference='Stop'
$InstallPath=(Resolve-Path -LiteralPath $InstallPath).Path.TrimEnd('\')
if (-not (Test-Path (Join-Path $InstallPath 'data\ledger.sqlite'))) { throw 'Existing ledger database not found. Stopped.' }
# Identify only the process bound to this application's port. Never kill unrelated Node processes.
$listeners=@(Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue | Sort-Object OwningProcess -Unique)
foreach ($listener in $listeners) {
 $ledgerPid=$listener.OwningProcess
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$ledgerPid)
 $absoluteServer=Join-Path $InstallPath 'server.cjs'
 if ($process.Name -ne 'node.exe' -or -not $process.CommandLine -or $process.CommandLine.IndexOf($absoluteServer,[StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'First setup: stop the OLD ledger window with Ctrl+C once, then retry. Cannot safely identify its process.' }
}
# Reject unsafe ZIP paths before extraction; the signed package contains no user data.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
 $expandedBytes=0L
 if ($archive.Entries.Count -gt 10000) { throw 'Too many archive files' }
 foreach ($entry in $archive.Entries) {
  $entryName=$entry.FullName.Replace('\','/')
  if ($entryName.StartsWith('/') -or $entryName.Contains(':') -or @($entryName.Split('/') | Where-Object { $_ -eq '..' }).Count -gt 0) { throw 'Unsafe ZIP path' }
  $expandedBytes+=$entry.Length
  if ($expandedBytes -gt 33554432) { throw 'Expanded archive too large' }
 }
} finally { $archive.Dispose() }
Expand-Archive -LiteralPath $ZipPath -DestinationPath $ReleasePath
$updater=Join-Path $ReleasePath 'Update-Windows.ps1'
if (-not (Test-Path $updater)) { throw 'Update entrypoint missing' }
$wasRunning=$listeners.Count -gt 0
foreach ($listener in $listeners) {
 Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
 Wait-Process -Id $listener.OwningProcess -Timeout 20 -ErrorAction SilentlyContinue
}
try {
 & $updater -InstallPath $InstallPath
} catch {
 if ($wasRunning -and (Test-Path (Join-Path $InstallPath 'Start-Windows.cmd'))) { Start-Process -FilePath (Join-Path $InstallPath 'Start-Windows.cmd') -WorkingDirectory $InstallPath }
 throw
}
Start-Process -FilePath (Join-Path $InstallPath 'Start-Windows.cmd') -WorkingDirectory $InstallPath
$ready=$false
for ($attempt=0;$attempt -lt 30;$attempt++) {
 try { $status=Invoke-RestMethod -Uri 'http://127.0.0.1:3210/api/status' -TimeoutSec 2; if ($status.initialized -eq $true) { $ready=$true; break } } catch {}
 Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'Files updated and backups retained, but server startup not confirmed. Check server window. No automatic database rollback was performed.' }
Write-Host 'Ledger updated and running. Existing data and HTTPS address preserved.'
`;
async function main(){if(process.platform!=='win32')throw Error('Run this client on the Windows ledger server');if(process.versions.node.split('.')[0]!=='24')throw Error('Node.js 24 is required');const home=process.env.LOCALAPPDATA;if(!home)throw Error('LOCALAPPDATA is unavailable');const tools=path.join(home,'FamilyLedgerUpdater');fs.mkdirSync(tools,{recursive:true});const lock=path.join(tools,'updating.lock');let handle;try{handle=fs.openSync(lock,'wx');}catch{throw Error('Another update may be running. Check open update windows before retrying.');}try{
 const configPath=path.join(tools,'settings.json'),statePath=path.join(tools,'installed.json');let config=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath)):{};
 if(!config.installPath){const choices=[path.join(os.homedir(),'FamilyLedger'),path.join(home,'FamilyLedger')].filter(p=>fs.existsSync(path.join(p,'data','ledger.sqlite'))&&fs.existsSync(path.join(p,'server.cjs')));if(choices.length!==1)throw Error('Cannot uniquely locate the existing ledger folder. Set installPath in '+configPath);config={installPath:choices[0]};fs.writeFileSync(configPath,JSON.stringify(config,null,2));}
 const release=verifyChannel(JSON.parse(await download(CHANNEL,16384)));const installed=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{};
 if(!compareVersion(release.version,installed.version||0)){console.log('Already on the latest version. Nothing changed.');return;}
 const bytes=await download(release.url,20*1024*1024);verifyPayload(bytes,release);const task=fs.mkdtempSync(path.join(os.tmpdir(),'family-ledger-update-'));const zip=path.join(task,'release.zip'),driver=path.join(task,'apply.ps1');fs.writeFileSync(zip,bytes);fs.writeFileSync(driver,'\uFEFF'+DRIVER);
 const result=cp.spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',driver,'-InstallPath',config.installPath,'-ZipPath',zip,'-ReleasePath',path.join(task,'release')],{stdio:'inherit'});
 if(result.error||result.status!==0)throw Error('Update did not complete. Original/backup files are retained; see the message above.');fs.writeFileSync(statePath,JSON.stringify({version:release.version,sha256:release.sha256,updated:new Date().toISOString()},null,2));console.log('SUCCESS: '+release.version);
 }finally{fs.closeSync(handle);fs.unlinkSync(lock);}}
module.exports={verifyChannel,verifyPayload,compareVersion,sha,DRIVER};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
