using System.Diagnostics;
using System.Text.Json;
using ChatPlatform.API.Configuration;
using Microsoft.Extensions.Options;

namespace ChatPlatform.API.Services;

public interface ISpeechService
{
    Task<(string Text, string Language)> TranscribeAsync(byte[] bytes, string extension, CancellationToken ct);
    Task<byte[]> SynthesizeAsync(string text, CancellationToken ct);
    string Status();
}

/// <summary>
/// Speech providers live behind the API. Python scripts use faster-whisper (offline STT)
/// and edge-tts (neural Arabic TTS). The browser never talks to either provider.
/// </summary>
public sealed class SpeechService(IOptions<SpeechOptions> options, ILogger<SpeechService> logger) : ISpeechService
{
    private readonly SpeechOptions _options = options.Value;

    public string Status() => $"stt=faster-whisper:{_options.SttModel}, tts=edge-tts:{_options.TtsVoice}";

    public async Task<(string Text, string Language)> TranscribeAsync(byte[] bytes, string extension, CancellationToken ct)
    {
        if (bytes.Length == 0) throw new AppException("EmptyAudio", "No audio was recorded.", 400);
        if (_options.AllowedAudioExtensions.Contains(extension) == false)
            throw new AppException("AudioTypeNotAllowed", $"Audio type '{extension}' is not allowed.", 415);
        if (bytes.Length > _options.MaxAudioBytes)
            throw new AppException("AudioTooLarge", "The recording is too large.", 413);

        var temp = Path.Combine(Path.GetTempPath(), $"HFR-stt-{Guid.NewGuid():N}{extension}");
        await System.IO.File.WriteAllBytesAsync(temp, bytes, ct);
        try
        {
            var json = await RunScriptAsync("stt.py", ct, temp, _options.SttModel);
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var text = root.GetProperty("text").GetString()?.Trim() ?? string.Empty;
            var language = root.TryGetProperty("language", out var lang) ? lang.GetString() ?? "unknown" : "unknown";
            if (string.IsNullOrWhiteSpace(text))
                throw new AppException("EmptyTranscript", "No speech was recognized in the recording.", 422);
            return (text, language);
        }
        catch (AppException) { throw; }
        catch (Exception ex)
        {
            logger.LogError(ex, "Speech-to-text failed");
            throw new AppException("SpeechToTextUnavailable",
                "Speech recognition is unavailable. Check the Python speech services.", 503);
        }
        finally
        {
            if (System.IO.File.Exists(temp)) System.IO.File.Delete(temp);
        }
    }

    public async Task<byte[]> SynthesizeAsync(string text, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text)) throw new AppException("EmptyText", "No text to synthesize.", 400);
        var temp = Path.Combine(Path.GetTempPath(), $"HFR-tts-{Guid.NewGuid():N}.mp3");
        try
        {
            await RunScriptAsync("tts.py", ct, temp, text, _options.TtsVoice);
            if (!System.IO.File.Exists(temp) || new FileInfo(temp).Length == 0)
                throw new AppException("TextToSpeechUnavailable", "No audio was generated.", 502);
            return await System.IO.File.ReadAllBytesAsync(temp, ct);
        }
        catch (AppException) { throw; }
        catch (Exception ex)
        {
            logger.LogError(ex, "Text-to-speech failed");
            throw new AppException("TextToSpeechUnavailable",
                "Arabic speech synthesis is unavailable. Check the TTS provider connection.", 503);
        }
        finally
        {
            if (System.IO.File.Exists(temp)) System.IO.File.Delete(temp);
        }
    }

    private async Task<string> RunScriptAsync(string script, CancellationToken ct, params string[] arguments)
    {
        var scriptPath = Path.Combine(_options.ScriptDirectory, script);
        if (!System.IO.File.Exists(scriptPath))
            throw new AppException("SpeechServiceMissing", $"Speech script not found: {scriptPath}", 503);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.TimeoutSeconds, 10, 900)));

        var startInfo = new ProcessStartInfo(_options.PythonExecutable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        if (!string.IsNullOrWhiteSpace(_options.PythonVersionArg))
            startInfo.ArgumentList.Add(_options.PythonVersionArg);
        startInfo.ArgumentList.Add(scriptPath);
        foreach (var argument in arguments) startInfo.ArgumentList.Add(argument);

        using var process = Process.Start(startInfo)
            ?? throw new AppException("SpeechServiceMissing", "Could not start the speech Python process.", 503);
        var outputTask = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var errorTask = process.StandardError.ReadToEndAsync(timeout.Token);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch { /* already exited */ }
            throw new AppException("SpeechTimeout", "The speech service timed out.", 504);
        }

        var output = await outputTask;
        var errors = await errorTask;
        if (process.ExitCode != 0)
            throw new AppException("SpeechServiceFailed",
                $"Speech script failed ({(errors.Length > 400 ? errors[..400] : errors)}).", 502);
        var start = output.IndexOf('{');
        if (start < 0) throw new AppException("SpeechServiceFailed", "Speech service returned no data.", 502);
        return output[start..];
    }
}
