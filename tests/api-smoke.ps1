$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5080'
$failures = @()

function Assert-True([bool]$condition, [string]$name) {
    if ($condition) { Write-Host "PASS  $name" -ForegroundColor Green }
    else { Write-Host "FAIL  $name" -ForegroundColor Red; $script:failures += $name }
}

function Call-Api([string]$method, [string]$path, $body, [string]$token, [string]$contentType = 'application/json') {
    $headers = @{ 'Content-Type' = $contentType }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    try {
        if ($null -ne $body) {
            return Invoke-WebRequest -Uri "$base$path" -Method $method -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -UseBasicParsing
        }
        return Invoke-WebRequest -Uri "$base$path" -Method $method -Headers $headers -UseBasicParsing
    }
    catch {
        return $_.Exception.Response
    }
}

function Status([object]$response) {
    if ($response -is [System.Net.HttpWebResponse]) { return [int]$response.StatusCode }
    return [int]$response.StatusCode
}

function Json([object]$response) {
    $content = $response.Content
    if ($content -is [byte[]]) { return [System.Text.Encoding]::UTF8.GetString($content) }
    return $content | ConvertFrom-Json
}

$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$email1 = "smoke1-$suffix@example.com"
$email2 = "smoke2-$suffix@example.com"
$password = 'StrongPass123!'

$r = Call-Api 'POST' '/api/auth/register' @{ email = $email1; password = $password; displayName = 'Smoke User' }
Assert-True ((Status $r) -eq 200) 'register user 1'
$auth = Json $r
$token = $auth.accessToken
$refresh = $auth.refreshToken

Assert-True (-not [string]::IsNullOrWhiteSpace($token)) 'access token issued'
Assert-True (-not [string]::IsNullOrWhiteSpace($refresh)) 'refresh token issued'

$r = Call-Api 'POST' '/api/auth/login' @{ email = $email1; password = 'wrong-password' }
Assert-True ((Status $r) -eq 401) 'invalid password rejected'

$r = Call-Api 'GET' '/api/users/me' $null $token
$me = Json $r
Assert-True ($me.email -eq $email1) 'current user profile'

$r = Call-Api 'GET' '/api/models' $null $token
$models = Json $r
Assert-True ($models.Count -ge 1) 'installed Ollama models discovered'
Assert-True (@($models | Where-Object { $_.name -like 'ALLAM*' }).Count -eq 0) 'no invented ALLAM models'
Assert-True (($models | Where-Object { $_.providerKey -eq 'ollama' }).Count -eq $models.Count) 'all models use ollama provider'
Assert-True (($models | Where-Object { $_.configured -eq $true }).Count -eq $models.Count) 'ollama models reported configured'

$r = Call-Api 'GET' '/api/skills' $null $token
$skills = Json $r
Assert-True ($skills.Count -eq 5) 'built-in skills seeded'
$skillId = $skills[0].id
$r = Call-Api 'PUT' "/api/skills/$skillId/enabled" @{ isEnabled = $false } $token
Assert-True ((Status $r) -eq 200) 'skill toggle persisted'
$r = Call-Api 'GET' '/api/skills' $null $token
Assert-True (((Json $r) | Where-Object { $_.id -eq $skillId }).isEnabled -eq $false) 'skill toggle survives reload'

$r = Call-Api 'GET' '/api/settings' $null $token
Assert-True ((Json $r).theme -eq 'light') 'default settings'
$r = Call-Api 'PUT' '/api/settings' @{ theme = 'dark'; language = 'en' } $token
Assert-True ((Status $r) -eq 200) 'settings update'
$r = Call-Api 'GET' '/api/settings' $null $token
Assert-True ((Json $r).theme -eq 'dark') 'settings persisted'

$r = Call-Api 'POST' '/api/projects' @{ name = "Smoke Project $suffix"; description = 'test' } $token
Assert-True ((Status $r) -eq 201) 'project created'
$project = Json $r
$r = Call-Api 'GET' '/api/projects' $null $token
Assert-True (@((Json $r) | Where-Object { $_.id -eq $project.id }).Count -eq 1) 'project listed'

$r = Call-Api 'POST' '/api/chats' @{ title = 'Smoke chat'; projectId = $project.id } $token
Assert-True ((Status $r) -eq 201) 'chat created'
$chat = Json $r
$r = Call-Api 'GET' '/api/chats' $null $token
Assert-True (@((Json $r).items | Where-Object { $_.id -eq $chat.id }).Count -eq 1) 'chat listed'

$reqId = [Guid]::NewGuid().ToString('N')
$r = Call-Api 'POST' "/api/chats/$($chat.id)/messages" @{ content = 'Hello'; requestId = $reqId } $token
Assert-True ((Status $r) -eq 201) 'user message persisted'
$r = Call-Api 'POST' "/api/chats/$($chat.id)/messages" @{ content = 'Hello'; requestId = $reqId } $token
$messages = Json $r
Assert-True (@($messages).Count -ge 1 -and $messages.content -eq 'Hello') 'idempotent retry did not duplicate message'
$r = Call-Api 'GET' "/api/chats/$($chat.id)/messages" $null $token
Assert-True (@((Json $r) | Where-Object { $_.role -eq 'user' }).Count -eq 1) 'exactly one user message stored'

# SSE streaming: real Ollama completion, token by token.
$headers = @{ 'Authorization' = "Bearer $token"; 'Content-Type' = 'application/json' }
$body = @{ content = 'Reply with exactly: OLLAMA_OK'; requestId = [Guid]::NewGuid().ToString('N') } | ConvertTo-Json
try {
    $sse = Invoke-WebRequest -Uri "$base/api/chats/$($chat.id)/stream" -Method Post -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 180
    $text = $sse.Content
} catch {
    $text = ''
}
Assert-True ($text -match 'event: token') 'stream emits real tokens'
Assert-True ($text -match 'event: done') 'stream completes'
Assert-True ($text -match 'OLLAMA_OK') 'Ollama produced the actual reply'

# User isolation
$r = Call-Api 'POST' '/api/auth/register' @{ email = $email2; password = $password; displayName = 'Other User' }
$other = Json $r
$token2 = $other.accessToken
$r = Call-Api 'GET' '/api/chats' $null $token2
Assert-True ((Json $r).items.Count -eq 0) 'second user cannot see first user chats'
$r = Call-Api 'GET' "/api/projects/$($project.id)" $null $token2
Assert-True ((Status $r) -eq 404) 'second user cannot read first user project (IDOR protected)'
$r = Call-Api 'GET' "/api/chats/$($chat.id)/messages" $null $token2
Assert-True ((Status $r) -eq 404) 'second user cannot read first user messages'

# Refresh rotation
$r = Call-Api 'POST' '/api/auth/refresh' @{ refreshToken = $refresh }
Assert-True ((Status $r) -eq 200) 'refresh token rotation'
$newTokens = Json $r
$r = Call-Api 'POST' '/api/auth/refresh' @{ refreshToken = $refresh }
Assert-True ((Status $r) -eq 401) 'reused refresh token rejected'

# File upload / signature validation
$tempFile = Join-Path $env:TEMP "HFR-smoke-$suffix.txt"
[System.IO.File]::WriteAllText($tempFile, 'plain text content')
$curlResult = & curl.exe -s -o NUL -w "%{http_code}" -X POST "$base/api/files/upload" -H "Authorization: Bearer $token" -F "file=@$tempFile"
Assert-True ($curlResult -eq '200') 'valid text file uploaded'
Remove-Item $tempFile -Force

Write-Host ""
if ($failures.Count -eq 0) { Write-Host "ALL API SMOKE TESTS PASSED" -ForegroundColor Cyan }
else { Write-Host "FAILED: $($failures -join ', ')" -ForegroundColor Red; exit 1 }
