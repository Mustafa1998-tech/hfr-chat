using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using ChatPlatform.API.Configuration;
using ChatPlatform.API.Data;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChatPlatform.API.Services.AI;

public record AiChatRequest(
    string SystemPrompt,
    IReadOnlyList<ChatMessageDto> Messages,
    string ModelId,
    string BaseUrl,
    string ApiKey,
    int TimeoutSeconds,
    int MaxOutputTokens,
    bool DeepResearch);

public interface IAiProvider
{
    string Key { get; }
    IAsyncEnumerable<string> StreamResponseAsync(AiChatRequest request, CancellationToken cancellationToken);
}

/// <summary>
/// Adapter for any OpenAI-compatible chat completions endpoint that supports SSE.
/// It is only used when BaseUrl and ApiKey are supplied through configuration.
/// </summary>
public sealed class OpenAiCompatibleProvider(IHttpClientFactory httpClientFactory) : IAiProvider
{
    public string Key => "openai-compatible";

    public async IAsyncEnumerable<string> StreamResponseAsync(
        AiChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.BaseUrl) || string.IsNullOrWhiteSpace(request.ApiKey))
            throw new AppException("ProviderNotConfigured",
                "The AI provider has no BaseUrl or API key configured. Set Ai:Providers configuration before using AI features.", 503);

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(request.TimeoutSeconds, 5, 600)));

        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(request.SystemPrompt))
            messages.Add(new { role = "system", content = request.SystemPrompt });
        foreach (var message in request.Messages)
            messages.Add(new { role = message.Role, content = message.Content });

        var payload = JsonSerializer.Serialize(new
        {
            model = request.ModelId,
            messages,
            stream = true,
            max_tokens = request.MaxOutputTokens,
        });

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, request.BaseUrl.TrimEnd('/') + "/chat/completions");
        httpRequest.Headers.TryAddWithoutValidation("Authorization", "Bearer " + request.ApiKey);
        httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await httpClientFactory.CreateClient().SendAsync(
            httpRequest, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            throw new AppException("ProviderRequestFailed",
                $"AI provider returned {(int)response.StatusCode}. {Truncate(body, 500)}", 502);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(timeoutCts.Token);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        while ((await reader.ReadLineAsync(timeoutCts.Token)) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data:", StringComparison.Ordinal)) continue;
            var data = line[5..].Trim();
            if (data == "[DONE]") yield break;

            using var json = JsonDocument.Parse(data);
            var delta = json.RootElement
                .GetProperty("choices")[0]
                .GetProperty("delta");
            if (delta.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.String)
            {
                var text = content.GetString();
                if (!string.IsNullOrEmpty(text)) yield return text;
            }
        }
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}

public interface IAiModelResolver
{
    Task<ResolvedModel> ResolveAsync(Guid userId, Guid? modelId, CancellationToken ct);
    Task<List<AIModelDto>> ListAsync(Guid userId, CancellationToken ct);
}

public record ResolvedModel(
    string ModelName,
    string ProviderKey,
    string ProviderModelId,
    string BaseUrl,
    string ApiKey,
    int TimeoutSeconds,
    int MaxOutputTokens,
    bool SupportsStreaming,
    bool Configured);

public sealed class AiModelResolver(
    AppDbContext db,
    IOptions<AiOptions> options,
    IOptions<OllamaOptions> ollamaOptions) : IAiModelResolver
{
    private readonly AiOptions _ai = options.Value;
    private readonly OllamaOptions _ollama = ollamaOptions.Value;

    public async Task<List<AIModelDto>> ListAsync(Guid userId, CancellationToken ct)
    {
        // Real names of locally installed Ollama models, no invented model labels.
        var models = await db.AIModels.Where(x => x.IsEnabled)
            .Include(x => x.Provider).OrderBy(x => x.Name).ToListAsync(ct);
        return models.Select(m => new AIModelDto(
            m.Id, m.Name, m.Description, m.Provider.Key, m.ContextWindow, m.MaxOutputTokens,
            IsConfigured(m), m.IsEnabled)).ToList();
    }

    public async Task<ResolvedModel> ResolveAsync(Guid userId, Guid? modelId, CancellationToken ct)
    {
        AIModel? model;
        if (modelId is { } id)
        {
            model = await db.AIModels.Include(x => x.Provider)
                .FirstOrDefaultAsync(x => x.Id == id && x.IsEnabled, ct)
                ?? throw new AppException("ModelNotFound", "AI model not found or disabled.", 404);
        }
        else
        {
            var settings = await db.UserSettings.AsNoTracking()
                .FirstOrDefaultAsync(x => x.UserId == userId, ct);
            model = settings?.DefaultModelId is { } defaultId
                ? await db.AIModels.Include(x => x.Provider)
                    .FirstOrDefaultAsync(x => x.Id == defaultId && x.IsEnabled, ct)
                : null;
            model ??= await db.AIModels.Include(x => x.Provider)
                .FirstOrDefaultAsync(x => x.Name == _ollama.DefaultModel && x.IsEnabled, ct);
            model ??= await db.AIModels.Include(x => x.Provider)
                .FirstOrDefaultAsync(x => x.IsEnabled, ct);
        }
        if (model is null)
            throw new AppException("NoModelsConfigured",
                "No Ollama models are available. Install a model or check the Ollama connection.", 503);

        var configured = IsConfigured(model);
        var apiKey = configured && _ai.Providers.TryGetValue(model.Provider.Key, out var config)
            ? config.ApiKey ?? string.Empty
            : string.Empty;
        return new ResolvedModel(
            model.Name,
            model.Provider.Key,
            model.ModelId,
            model.Provider.BaseUrl ?? _ollama.BaseUrl,
            apiKey,
            model.Provider.TimeoutSeconds,
            model.MaxOutputTokens,
            model.Provider.SupportsStreaming,
            configured);
    }

    private bool IsConfigured(AIModel model)
    {
        if (model.Provider.Key == OllamaService.ProviderKey) return model.Provider.IsEnabled;
        return model.Provider.IsEnabled
            && _ai.Providers.TryGetValue(model.Provider.Key, out var config)
            && !string.IsNullOrWhiteSpace(config.BaseUrl)
            && !string.IsNullOrWhiteSpace(config.ApiKey);
    }
}

public sealed class AiOrchestrator(IEnumerable<IAiProvider> providers, IAiModelResolver resolver)
{
    public async IAsyncEnumerable<string> StreamAsync(
        Guid userId,
        Guid? modelId,
        AssistantContext context,
        bool deepResearch,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var model = await resolver.ResolveAsync(userId, modelId, cancellationToken);
        if (!model.Configured)
            throw new AppException("ProviderNotConfigured",
                $"'{model.ModelName}' is not available. Check the Ollama connection and installed models.", 503);
        if (deepResearch)
            throw new AppException("DeepResearchUnavailable",
                "Deep Research requires a configured search/research provider. None is configured.", 503);

        // Ollama is the default provider; other adapters remain available via the same interface.
        var provider = providers.FirstOrDefault(p => p.Key == model.ProviderKey)
            ?? throw new AppException("ProviderUnavailable",
                $"No provider adapter is registered for '{model.ProviderKey}'.", 503);

        var request = new AiChatRequest(
            context.SystemPrompt, context.Messages, model.ProviderModelId, model.BaseUrl,
            model.ApiKey, model.TimeoutSeconds, model.MaxOutputTokens, deepResearch);

        await foreach (var token in provider.StreamResponseAsync(request, cancellationToken).WithCancellation(cancellationToken))
            yield return token;
    }
}
