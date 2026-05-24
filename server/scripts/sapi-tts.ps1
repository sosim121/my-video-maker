param(
  [Parameter(Mandatory = $true)][string]$TextPath,
  [Parameter(Mandatory = $true)][string]$OutPath,
  [string]$VoiceName = "Microsoft Heami Desktop"
)

Add-Type -AssemblyName System.Speech

$text = [System.IO.File]::ReadAllText($TextPath, [System.Text.Encoding]::UTF8)
$directory = [System.IO.Path]::GetDirectoryName($OutPath)
[System.IO.Directory]::CreateDirectory($directory) | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synth.GetInstalledVoices() |
    Where-Object { $_.VoiceInfo.Name -eq $VoiceName } |
    Select-Object -First 1

  if ($voice -ne $null) {
    $synth.SelectVoice($VoiceName)
  }

  $synth.Rate = 0
  $synth.Volume = 100
  $synth.SetOutputToWaveFile($OutPath)
  $synth.Speak($text)
}
finally {
  $synth.SetOutputToNull()
  $synth.Dispose()
}
