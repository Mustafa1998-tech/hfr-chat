using ChatPlatform.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/voice")]
public class VoiceController(ISpeechService speech) : ControllerBase
{
    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        configured = true,
        details = speech.Status(),
        stt = speech.Status().Contains("Whisper.net") ? "Whisper.net" : "faster-whisper",
        tts = speech.Status().Contains("Piper") ? "Piper" : "edge-tts",
        arabicSupported = true,
    });

    [HttpPost("transcribe")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> Transcribe(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "EmptyAudio", message = "An audio file is required." });
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        using var memory = new MemoryStream();
        await file.CopyToAsync(memory, ct);
        var (text, language) = await speech.TranscribeAsync(memory.ToArray(), extension, ct);
        return Ok(new { text, language });
    }

    [HttpPost("synthesize")]
    public async Task<IActionResult> Synthesize([FromBody] SynthesizeRequest request, CancellationToken ct)
    {
        var bytes = await speech.SynthesizeAsync(request.Text, ct);
        var contentType = request.Text.Length > 0 ? "audio/wav" : "audio/mpeg";
        return File(bytes, contentType, "reply.wav");
    }
}

public record SynthesizeRequest(string Text);
