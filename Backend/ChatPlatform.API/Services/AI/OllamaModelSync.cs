using ChatPlatform.API.Configuration;
using ChatPlatform.API.Data;
using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChatPlatform.API.Services.AI;

public interface IOllamaModelSync
{
    Task SyncAsync(CancellationToken ct);
}

/// <summary>
/// Keeps the AIModels table in sync with the models actually installed in Ollama.
/// Stale models are disabled/removed so the UI never shows unavailable choices.
/// </summary>
public sealed class OllamaModelSync(
    AppDbContext db,
    IOllamaClient client,
    IOptions<OllamaOptions> options,
    ILogger<OllamaModelSync> logger) : IOllamaModelSync
{
    public async Task SyncAsync(CancellationToken ct)
    {
        // A browser refresh must not abort model synchronisation mid-write. Use an
        // internal timeout instead of the request's cancellation token.
        ct = CancellationToken.None;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        List<OllamaModelInfo> installed;
        try
        {
            installed = await client.GetInstalledModelsAsync(timeout.Token);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Ollama model discovery failed. No models will be advertised until it is reachable.");
            await db.AIModels.ExecuteUpdateAsync(x => x.SetProperty(m => m.IsEnabled, false), CancellationToken.None);
            await db.SaveChangesAsync(CancellationToken.None);
            return;
        }

        var provider = await db.AIProviders.FirstOrDefaultAsync(x => x.Key == OllamaService.ProviderKey, ct);
        if (provider is null)
        {
            provider = new AIProvider { Key = OllamaService.ProviderKey };
            db.AIProviders.Add(provider);
        }
        provider.DisplayName = "Ollama (local)";
        provider.BaseUrl = options.Value.BaseUrl;
        provider.TimeoutSeconds = options.Value.TimeoutSeconds;
        provider.SupportsStreaming = true;
        provider.IsEnabled = true;
        await db.SaveChangesAsync(ct);

        var available = new List<(OllamaModelInfo Info, OllamaModelInfo Details)>();
        foreach (var model in installed)
        {
            if (model.Name.Contains("embed", StringComparison.OrdinalIgnoreCase)) continue;
            var details = await client.ShowModelAsync(model.Name, timeout.Token) ?? model;
            var canComplete = details.Capabilities.Count == 0
                || details.Capabilities.Contains("completion", StringComparer.OrdinalIgnoreCase);
            if (canComplete) available.Add((model, details));
        }

        var installedNames = available.Select(x => x.Info.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var stale in await db.AIModels.Where(x => !installedNames.Contains(x.Name)).ToListAsync(ct))
            db.AIModels.Remove(stale);
        await db.SaveChangesAsync(ct);

        foreach (var (info, details) in available)
        {
            var entity = await db.AIModels.FirstOrDefaultAsync(
                x => x.Name == info.Name, ct);
            if (entity is null)
            {
                entity = new AIModel { Name = info.Name };
                db.AIModels.Add(entity);
            }
            entity.ProviderId = provider.Id;
            entity.ModelId = info.Name;
            entity.Description = string.Join(" • ", new[]
            {
                details.Family,
                details.ParameterSize,
                $"{info.SizeBytes / 1_000_000_000.0:F1} GB",
            }.Where(x => !string.IsNullOrWhiteSpace(x)));
            entity.IsEnabled = true;
            entity.MaxOutputTokens = 4096;
            entity.ContextWindow = 32768;
        }
        await db.SaveChangesAsync(ct);

        // Default model must be one that is actually installed.
        var preferred = options.Value.DefaultModel;
        var defaultModel = available.Any(x => x.Info.Name == preferred)
            ? preferred
            : available.OrderBy(x => x.Info.SizeBytes).FirstOrDefault().Info?.Name;
        if (!string.IsNullOrWhiteSpace(defaultModel))
            logger.LogInformation("Ollama default model: {Model}", defaultModel);

        foreach (var settings in await db.UserSettings
                     .Where(x => x.DefaultModelId != null).ToListAsync(ct))
        {
            if (!installedNames.Contains(await db.AIModels.Where(x => x.Id == settings.DefaultModelId)
                    .Select(x => x.Name).FirstOrDefaultAsync(ct) ?? string.Empty))
                settings.DefaultModelId = null;
        }
        await db.SaveChangesAsync(ct);
    }
}
