# Tehila scan bridge - lets the Tehila website scan straight from the office
# scanner into a claim (like BAFI). A browser cannot reach a USB
# scanner, so this runs on the PC, listens on 127.0.0.1 only, and calls the free
# NAPS2 console to scan. Only the Tehila site (Origins) may call it.
#   GET  /health  -> {"ok":true,"device":"..."}
#   POST /scan?source=feeder|duplex|glass&color=bw|gray|color  -> application/pdf
param(
  [int]$Port = 47615,
  [string]$Naps2 = "$env:ProgramFiles\NAPS2\NAPS2.Console.exe",
  [string]$Device = "",
  [string]$Driver = "twain",
  [int]$Dpi = 200,
  [string[]]$Origins = @('https://amit-maymon-new-psi.vercel.app', 'http://localhost:3000')
)

$ErrorActionPreference = 'Stop'
$log = Join-Path $env:LOCALAPPDATA 'TehilaScanBridge\bridge.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
function Log($m) { "$(Get-Date -Format s) $m" | Add-Content -Path $log -Encoding utf8 }

if (-not (Test-Path $Naps2)) { Log "NAPS2 not found at $Naps2"; throw "NAPS2 not found at $Naps2" }

function Send($stream, [int]$code, [string]$type, [byte[]]$body, [string]$origin) {
  $reason = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 500 = 'Error' }[$code]
  $h = "HTTP/1.1 $code $reason`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n"
  if ($origin) {
    # Chrome's Private Network Access needs the last header for a public site -> localhost.
    $h += "Access-Control-Allow-Origin: $origin`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`n"
  }
  $hb = [Text.Encoding]::ASCII.GetBytes("$h`r`n")
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length) { $stream.Write($body, 0, $body.Length) }
}
function Json($o) { [Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Compress)) }

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Log "listening on 127.0.0.1:$Port (device: '$Device', driver: $Driver)"

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
    $first = $reader.ReadLine()
    if (-not $first) { continue }
    $headers = @{}
    while (($line = $reader.ReadLine())) { $i = $line.IndexOf(':'); if ($i -gt 0) { $headers[$line.Substring(0, $i).Trim().ToLower()] = $line.Substring($i + 1).Trim() } }
    $method, $target = $first.Split(' ')[0, 1]
    $origin = $headers['origin']
    $allowed = $origin -and ($Origins -contains $origin)
    if (-not $allowed) { Send $stream 403 'text/plain' ([Text.Encoding]::ASCII.GetBytes('forbidden')) $null; continue }

    $path, $query = $target.Split('?', 2)
    $qs = @{}
    if ($query) { foreach ($kv in $query.Split('&')) { $k, $v = $kv.Split('=', 2); $qs[$k] = [Uri]::UnescapeDataString("$v") } }

    if ($method -eq 'OPTIONS') { Send $stream 204 'text/plain' ([byte[]]@()) $origin; continue }
    if ($method -eq 'GET' -and $path -eq '/health') { Send $stream 200 'application/json' (Json @{ ok = $true; device = $Device }) $origin; continue }
    if ($method -ne 'POST' -or $path -ne '/scan') { Send $stream 404 'text/plain' ([Text.Encoding]::ASCII.GetBytes('not found')) $origin; continue }

    $source = if ($qs['source'] -in 'feeder', 'duplex', 'glass') { $qs['source'] } else { 'feeder' }
    $color = if ($qs['color'] -in 'bw', 'gray', 'color') { $qs['color'] } else { 'gray' }
    $out = Join-Path $env:TEMP ("tehila-scan-" + [guid]::NewGuid().ToString('N') + '.pdf')
    $naps = @('-o', "`"$out`"", '--driver', $Driver, '--source', $source, '--bitdepth', $color, '--dpi', "$Dpi", '-f')
    if ($Device) { $naps += @('--device', "`"$Device`"") }
    Log "scan $source/$color"
    $p = Start-Process -FilePath $Naps2 -ArgumentList $naps -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0 -or -not (Test-Path $out)) {
      Log "scan failed, exit $($p.ExitCode)"
      Send $stream 500 'application/json' (Json @{ error = 'scan-failed' }) $origin
      continue
    }
    $bytes = [IO.File]::ReadAllBytes($out)
    Remove-Item $out -Force
    Send $stream 200 'application/pdf' $bytes $origin
  } catch {
    Log "error: $_"
  } finally {
    $client.Close()
  }
}
