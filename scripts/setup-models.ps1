# Downloads the large local speech assets that are intentionally excluded from Git
# (GitHub's 100 MB per-file limit). Run once before starting the API.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root 'Backend\models'
$backend = Join-Path $root 'Backend'
New-Item -ItemType Directory -Force $models | Out-Null

function Download($url, $destination) {
  if (Test-Path $destination) { "already exists: $destination"; return }
  "downloading $destination ..."
  curl.exe -L --fail --retry 2 -o $destination $url
}

Download 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' `
  (Join-Path $models 'ggml-small.bin')
Download 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx' `
  (Join-Path $models 'ar_JO-kareem-medium.onnx')
Download 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json' `
  (Join-Path $models 'ar_JO-kareem-medium.onnx.json')

# ffmpeg binary bundled with imageio-ffmpeg (used to convert WebM -> 16k mono WAV)
$ffmpeg = Join-Path $backend 'ffmpeg.exe'
if (-not (Test-Path $ffmpeg)) {
  "downloading ffmpeg ..."
  $zip = Join-Path $env:TEMP 'hfr-imageio-ffmpeg.whl'
  curl.exe -L --fail --retry 2 -o $zip 'https://pypi.org/pypi/imageio-ffmpeg/json'
  py -3.13 -m pip install --disable-pip-version-check --quiet imageio-ffmpeg
  $exe = py -3.13 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
  Copy-Item $exe $ffmpeg -Force
}

"Done. Configure absolute paths in Backend/ChatPlatform.API/appsettings.json (Speech section) if needed."
