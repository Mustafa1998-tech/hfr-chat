using System.Diagnostics;
using System.Text;
using ChatPlatform.API.Configuration;
using Microsoft.Extensions.Options;
using Whisper.net;

namespace ChatPlatform.API.Services;

/// <summary>
/// Native speech stack: Whisper.net (offline multilingual STT) + Piper (local Arabic TTS).
/// No Python runtime is required. Models and native binaries are configured in appsettings.
/// </summary>
public sealed class NativeSpeechService : ISpeechService, IDisposable
{
    private readonly SpeechOptions _options;
    private readonly WhisperFactory _factory;
    private readonly WhisperProcessor _processor;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public NativeSpeechService(IOptions<SpeechOptions> options)
    {
        _options = options.Value;
        if (!File.Exists(_options.WhisperModelPath))
            throw new InvalidOperationException($"Whisper model not found: {_options.WhisperModelPath}");
        _factory = WhisperFactory.FromPath(_options.WhisperModelPath);
        _processor = _factory.CreateBuilder()
            .WithLanguage("ar")
            .WithThreads(Math.Max(1, _options.WhisperThreads))
            .Build();
    }

    public string Status() => $"stt=Whisper.net:{Path.GetFileName(_options.WhisperModelPath)}, tts=Piper:{Path.GetFileName(_options.PiperModelPath)}";

    public async Task<(string Text, string Language)> TranscribeAsync(byte[] bytes, string extension, CancellationToken ct)
    {
        ValidateAudio(bytes, extension);
        var id = Guid.NewGuid().ToString("N");
        var input = Path.Combine(Path.GetTempPath(), $"hfr-stt-{id}-input{extension}");
        var wav = Path.Combine(Path.GetTempPath(), $"hfr-stt-{id}-16k.wav");
        try
        {
            await File.WriteAllBytesAsync(input, bytes, ct);
            await RunProcessAsync(_options.FfmpegExecutable,
                ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav],
                null, _options.TimeoutSeconds, ct);

            await _gate.WaitAsync(ct);
            try
            {
                var text = new StringBuilder();
                await foreach (var result in _processor.ProcessAsync(File.OpenRead(wav), ct))
                    text.Append(result.Text);
                var transcript = text.ToString().Trim();
                if (string.IsNullOrWhiteSpace(transcript))
                    throw new AppException("EmptyTranscript", "No speech was recognized in the recording.", 422);
                return (transcript, "ar");
            }
            finally { _gate.Release(); }
        }
        catch (AppException) { throw; }
        catch (Exception ex)
        {
            throw new AppException("SpeechToTextUnavailable", $"Whisper.net failed: {ex.Message}", 503);
        }
        finally
        {
            Delete(input); Delete(wav);
        }
    }

    public async Task<byte[]> SynthesizeAsync(string text, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text)) throw new AppException("EmptyText", "No text to synthesize.", 400);
        var wav = Path.Combine(Path.GetTempPath(), $"hfr-tts-{Guid.NewGuid():N}.wav");
        try
        {
            var args = new List<string>
            {
                "-m", _options.PiperModelPath,
                "-f", wav,
                "--espeak_data", _options.PiperEspeakData,
                "--tashkeel_model", _options.PiperTashkeelPath,
                "--sentence_silence", "0.15",
                "-q",
            };
            await RunProcessAsync(_options.PiperExecutable, args, text, _options.TimeoutSeconds, ct);
            if (!File.Exists(wav) || new FileInfo(wav).Length == 0)
                throw new AppException("TextToSpeechUnavailable", "Piper produced no audio.", 502);
            return await File.ReadAllBytesAsync(wav, ct);
        }
        catch (AppException) { throw; }
        catch (Exception ex)
        {
            throw new AppException("TextToSpeechUnavailable", $"Piper failed: {ex.Message}", 503);
        }
        finally { Delete(wav); }
    }

    private void ValidateAudio(byte[] bytes, string extension)
    {
        if (bytes.Length == 0) throw new AppException("EmptyAudio", "No audio was recorded.", 400);
        if (!_options.AllowedAudioExtensions.Contains(extension))
            throw new AppException("AudioTypeNotAllowed", $"Audio type '{extension}' is not allowed.", 415);
        if (bytes.Length > _options.MaxAudioBytes)
            throw new AppException("AudioTooLarge", "The recording is too large.", 413);
    }

    private static async Task RunProcessAsync(string executable, IEnumerable<string> arguments, string? stdin, int timeoutSeconds, CancellationToken ct)
    {
        if (!File.Exists(executable))
            throw new AppException("SpeechServiceMissing", $"Speech binary not found: {executable}", 503);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(timeoutSeconds, 10, 900)));

        var start = new ProcessStartInfo(executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = stdin is not null,
            StandardOutputEncoding = new UTF8Encoding(false),
            StandardErrorEncoding = new UTF8Encoding(false),
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        if (stdin is not null) start.StandardInputEncoding = new UTF8Encoding(false);
        using var process = Process.Start(start) ?? throw new AppException("SpeechServiceMissing", "Could not start speech binary.", 503);
        var errors = process.StandardError.ReadToEndAsync(timeout.Token);
        if (stdin is not null)
        {
            await process.StandardInput.WriteAsync(stdin.AsMemory(), timeout.Token);
            process.StandardInput.Close();
        }
        await process.WaitForExitAsync(timeout.Token);
        var errorText = await errors;
        if (process.ExitCode != 0)
            throw new AppException("SpeechServiceFailed",
                $"Speech binary exited {process.ExitCode}: {errorText[^Math.Min(800, errorText.Length)..]}", 502);
    }

    private static void Delete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* ignore */ }
    }

    public void Dispose()
    {
        _processor.Dispose();
        _factory.Dispose();
        _gate.Dispose();
    }
}
