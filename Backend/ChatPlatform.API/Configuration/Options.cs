namespace ChatPlatform.API.Configuration;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    [System.ComponentModel.DataAnnotations.Required]
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = "ChatPlatform";
    public string Audience { get; set; } = "ChatPlatform.Client";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
}

public class OllamaOptions
{
    public const string SectionName = "Ollama";

    public string BaseUrl { get; set; } = "http://localhost:11434";

    // Empty means: choose the smallest installed non-embedding model at startup.
    public string DefaultModel { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 300;
}

public class AiOptions
{
    public const string SectionName = "Ai";

    // Key -> provider settings. ApiKey is read from configuration/environment ONLY and
    // is never written to the database or returned to clients.
    public Dictionary<string, ProviderOptions> Providers { get; set; } = new();

    // Key -> model definition. The key is the display name shown in the UI.
    public Dictionary<string, ModelOptions> Models { get; set; } = new();
}

public class ProviderOptions
{
    public string? DisplayName { get; set; }
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
    public int TimeoutSeconds { get; set; } = 60;
    public bool SupportsStreaming { get; set; } = true;
}

public class ModelOptions
{
    public string ProviderKey { get; set; } = string.Empty;
    public string ModelId { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int ContextWindow { get; set; } = 32768;
    public int MaxOutputTokens { get; set; } = 4096;
    public bool Enabled { get; set; } = true;
}

public class SpeechOptions
{
    public const string SectionName = "Speech";
    public string PythonExecutable { get; set; } = "py";
    public string PythonVersionArg { get; set; } = "-3.13";
    public string ScriptDirectory { get; set; } = "speech";
    public string SttModel { get; set; } = "small";
    public string TtsVoice { get; set; } = "ar-SA-ZariyahNeural";
    public int TimeoutSeconds { get; set; } = 180;

    // "native" = Whisper.net + Piper (default), "python" = legacy Python scripts.
    public string Provider { get; set; } = "native";
    public string WhisperModelPath { get; set; } = "models/ggml-small.bin";
    public int WhisperThreads { get; set; } = 4;
    public string PiperExecutable { get; set; } = "piper/piper/piper.exe";
    public string PiperModelPath { get; set; } = "models/ar_JO-kareem-medium.onnx";
    public string PiperTashkeelPath { get; set; } = "piper/piper/libtashkeel_model.ort";
    public string PiperEspeakData { get; set; } = "piper/piper/espeak-ng-data";
    public string FfmpegExecutable { get; set; } = "ffmpeg.exe";

    public string[] AllowedAudioExtensions { get; set; } = [".webm", ".wav", ".mp3", ".ogg", ".m4a"];
    public long MaxAudioBytes { get; set; } = 20 * 1024 * 1024;
}

public class RateLimitingOptions
{
    public const string SectionName = "RateLimiting";
    public int PermitLimit { get; set; } = 120;
    public int WindowMinutes { get; set; } = 1;
}

public class FileUploadOptions
{
    public const string SectionName = "Files";
    public long MaxBytes { get; set; } = 20 * 1024 * 1024;
    public string[] AllowedExtensions { get; set; } = [".txt", ".md", ".csv", ".json", ".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx"];
}
