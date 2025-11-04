New-Item -ItemType Directory -Force -Path 'icons' | Out-Null
$b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
[IO.File]::WriteAllBytes('icons/icon128.png',[Convert]::FromBase64String($b64))
Write-Output 'Icon generated at icons/icon128.png'