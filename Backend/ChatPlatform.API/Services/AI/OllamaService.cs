using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using ChatPlatform.API.Configuration;
using Microsoft.Extensions.Options;

namespace ChatPlatform.API.Services.AI;

public record OllamaModelInfo(
    string Name,
    long SizeBytes,
    string Family,
    string ParameterSize,
    IReadOnlyList<string> Capabilities);

public interface IOllamaTranslator
{
    Task<string> TranslateAsync(string text, string from, string to, string modelId, CancellationToken ct);
}

public interface IOllamaClient
{
    Task<List<OllamaModelInfo>> GetInstalledModelsAsync(CancellationToken ct);
    Task<OllamaModelInfo?> ShowModelAsync(string name, CancellationToken ct);
}

/// <summary>
/// Primary inference provider. Talks only to the private Ollama endpoint configured
/// on the API server; Angular never contacts Ollama directly.
/// </summary>
public sealed class OllamaService : IAiProvider, IOllamaClient, IOllamaTranslator
{
    public const string ProviderKey = "ollama";
    public string Key => ProviderKey;

    private readonly IHttpClientFactory _factory;
    private readonly OllamaOptions _options;

    public OllamaService(IHttpClientFactory factory, IOptions<OllamaOptions> options)
    {
        _factory = factory;
        _options = options.Value;
    }

    public async Task<List<OllamaModelInfo>> GetInstalledModelsAsync(CancellationToken ct)
    {
        using var client = CreateClient();
        using var response = await client.GetAsync("/api/tags", ct);
        EnsureSuccess(response);
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var result = new List<OllamaModelInfo>();
        if (!document.RootElement.TryGetProperty("models", out var models)) return result;

        foreach (var item in models.EnumerateArray())
        {
            var name = item.GetProperty("name").GetString();
            if (string.IsNullOrWhiteSpace(name)) continue;
            var size = item.TryGetProperty("size", out var s) && s.TryGetInt64(out var value) ? value : 0;
            result.Add(new OllamaModelInfo(name, size, string.Empty, string.Empty, []));
        }
        return result;
    }

    public async Task<OllamaModelInfo?> ShowModelAsync(string name, CancellationToken ct)
    {
        using var client = CreateClient();
        var payload = JsonSerializer.Serialize(new { name });
        using var response = await client.PostAsync("/api/show",
            new StringContent(payload, Encoding.UTF8, "application/json"), ct);
        if (!response.IsSuccessStatusCode) return null;
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var root = document.RootElement;
        var family = GetString(root, "details", "family") ?? string.Empty;
        var parameterSize = GetString(root, "details", "parameter_size") ?? string.Empty;
        var capabilities = new List<string>();
        if (root.TryGetProperty("capabilities", out var caps) && caps.ValueKind == JsonValueKind.Array)
            foreach (var cap in caps.EnumerateArray())
                if (cap.GetString() is { } value) capabilities.Add(value);
        return new OllamaModelInfo(name, 0, family, parameterSize, capabilities);
    }

    public async Task<string> TranslateAsync(string text, string from, string to, string modelId, CancellationToken ct)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.TimeoutSeconds, 10, 1800)));

        var source = from == "auto" ? "the detected source language" : from;
        var target = to == "ar" ? "Arabic" : "English";
        var system = $"You are a professional translator. Translate the user's text from {source} into {target}. " +
                     "Output ONLY the translation. Do not add explanations, quotes, prefixes or notes. " +
                     "Preserve the meaning, tone and formatting.";
        var payload = JsonSerializer.Serialize(new
        {
            model = modelId,
            stream = false,
            messages = new object[]
            {
                new { role = "system", content = system },
                new { role = "user", content = text },
            },
        });
        using var client = CreateClient();
        using var response = await client.PostAsync("/api/chat",
            new StringContent(payload, Encoding.UTF8, "application/json"), timeoutCts.Token);
        if (!response.IsSuccessStatusCode)
            throw new AppException("TranslationFailed",
                $"Ollama returned {(int)response.StatusCode} during translation.", 502);
        await using var stream = await response.Content.ReadAsStreamAsync(timeoutCts.Token);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: timeoutCts.Token);
        var content = document.RootElement.GetProperty("message").GetProperty("content").GetString();
        return (content ?? string.Empty).Trim();
    }

    public async IAsyncEnumerable<string> StreamResponseAsync(
        AiChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.TimeoutSeconds, 10, 1800)));

        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(request.SystemPrompt))
            messages.Add(new { role = "system", content = request.SystemPrompt });
        foreach (var message in request.Messages)
            messages.Add(new { role = message.Role, content = message.Content });

        var payload = JsonSerializer.Serialize(new
        {
            model = request.ModelId,
            stream = true,
            messages,
            options = new { num_predict = Math.Clamp(request.MaxOutputTokens, 1, 32768) },
        });

        using var client = CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "/api/chat")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };

        using var response = await client.SendAsync(httpRequest,
            HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            throw new AppException("OllamaRequestFailed",
                $"Ollama returned {(int)response.StatusCode}: {Truncate(body, 400)}", 502);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(timeoutCts.Token);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        while ((await reader.ReadLineAsync(timeoutCts.Token)) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            string? token = null;
            try
            {
                using var json = JsonDocument.Parse(line);
                var root = json.RootElement;
                if (root.TryGetProperty("error", out var error))
                    throw new AppException("OllamaGenerationFailed",
                        Truncate(error.GetString() ?? "Generation failed.", 500), 502);
                if (root.TryGetProperty("message", out var message)
                    && message.TryGetProperty("content", out var content)
                    && content.ValueKind == JsonValueKind.String)
                    token = content.GetString();
            }
            catch (JsonException)
            {
                throw new AppException("OllamaStreamInvalid",
                    "Ollama returned an unreadable streaming response.", 502);
            }
            if (!string.IsNullOrEmpty(token)) yield return token;
        }
    }

    private HttpClient CreateClient()
    {
        var client = _factory.CreateClient();
        client.BaseAddress = new Uri(_options.BaseUrl.TrimEnd('/') + "/");
        client.Timeout = TimeSpan.FromSeconds(Math.Clamp(_options.TimeoutSeconds, 10, 1800));
        return client;
    }

    private static void EnsureSuccess(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        throw new AppException("OllamaUnavailable",
            $"Ollama is not reachable ({(int)response.StatusCode}). Check Ollama:BaseUrl.", 503);
    }

    private static string? GetString(JsonElement root, string parent, string property) =>
        root.TryGetProperty(parent, out var section) && section.TryGetProperty(property, out var value)
            ? value.GetString()
            : null;

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
