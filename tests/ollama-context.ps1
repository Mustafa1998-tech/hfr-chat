$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5080'
$email = "ctx-$([Guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$password = 'StrongPass123!'

$r = Invoke-RestMethod -Uri "$base/api/auth/register" -Method Post -Headers @{ 'Content-Type'='application/json' } -Body (@{ email=$email; password=$password; displayName='Context User' } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($r.accessToken)"; 'Content-Type'='application/json' }

function Send-Stream([string]$chatId, [string]$prompt) {
    $body = @{ content=$prompt; requestId=[Guid]::NewGuid().ToString('N') } | ConvertTo-Json
    $sse = Invoke-WebRequest -Uri "$base/api/chats/$chatId/stream" -Method Post -Headers $h -Body $body -UseBasicParsing -TimeoutSec 180
    return $sse.Content
}

# Skill instructions must reach the model.
$skill = Invoke-RestMethod -Uri "$base/api/skills" -Method Post -Headers $h -Body (@{
    name='Marker Skill'
    description='Test skill instruction injection'
    instructions='You MUST begin every reply with the exact token SKILL_ACTIVE_ followed by a short answer. Never omit this token.'
} | ConvertTo-Json)
$chat = Invoke-RestMethod -Uri "$base/api/chats" -Method Post -Headers $h -Body (@{ title='Skill context' } | ConvertTo-Json)
$stream = Send-Stream $chat.id 'Say hello.'
if ($stream -notmatch 'SKILL_ACTIVE_') { throw 'Enabled skill instructions did not affect the AI response.' }
Write-Host 'PASS enabled skill instructions injected into Ollama request' -ForegroundColor Green

# Project instructions must reach the model.
$project = Invoke-RestMethod -Uri "$base/api/projects" -Method Post -Headers $h -Body (@{
    name='Context Project'
    description='Test'
    instructions='You MUST begin every reply with the exact token PROJECT_ACTIVE_ followed by a short answer.'
} | ConvertTo-Json)
$chat2 = Invoke-RestMethod -Uri "$base/api/chats" -Method Post -Headers $h -Body (@{ title='Project context'; projectId=$project.id } | ConvertTo-Json)
$stream2 = Send-Stream $chat2.id 'Say hello.'
if ($stream2 -notmatch 'PROJECT_ACTIVE_') { throw 'Project instructions did not affect the AI response.' }
Write-Host 'PASS project instructions injected into Ollama request' -ForegroundColor Green

# Disabling the skill must remove its marker.
Invoke-RestMethod -Uri "$base/api/skills/$($skill.id)/enabled" -Method Put -Headers $h -Body (@{ isEnabled=$false } | ConvertTo-Json) | Out-Null
$chat3 = Invoke-RestMethod -Uri "$base/api/chats" -Method Post -Headers $h -Body (@{ title='No skill' } | ConvertTo-Json)
$stream3 = Send-Stream $chat3.id 'Say hello.'
if ($stream3 -match 'SKILL_ACTIVE_') { throw 'Disabled skill still affected the AI response.' }
Write-Host 'PASS disabling a skill removes its instructions from requests' -ForegroundColor Green
