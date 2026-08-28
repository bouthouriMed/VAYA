Set-Location "C:\Users\User\Desktop\VAYA"

Write-Host "=========================================="
Write-Host " VAYA - RESUMING CLAUDE CODE"
Write-Host "=========================================="
Write-Host ""

git status

Write-Host ""

$prompt = Get-Content ".\claude-resume.txt" -Raw

claude $prompt

Write-Host ""

Write-Host "Claude Code session ended."

Read-Host "Press Enter to close"