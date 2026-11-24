using System.Text;
using ChatPlatform.API.Configuration;
using ChatPlatform.API.Data;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Models;
using ChatPlatform.API.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace ChatPlatform.Tests;

public class ServiceTests
{
    private static AppDbContext NewDb() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static IOptions<JwtOptions> Jwt() => Options.Create(new JwtOptions
    {
        Key = "test-signing-key-that-is-longer-than-thirty-two-bytes-for-tests",
        AccessTokenMinutes = 15,
        RefreshTokenDays = 7,
    });

    [Fact]
    public async Task Register_HashesPassword_AndCreatesDefaultSettings()
    {
        await using var db = NewDb();
        var service = new AuthService(db, Jwt());
        var result = await service.RegisterAsync(
            new RegisterRequest("user@example.com", "StrongPass123!", "Test User"), null, default);

        var user = await db.Users.Include(x => x.Settings).SingleAsync();
        Assert.NotEqual("StrongPass123!", Encoding.UTF8.GetString(user.PasswordHash));
        Assert.NotEmpty(user.PasswordSalt);
        Assert.NotNull(user.Settings);
        Assert.Equal("light", user.Settings!.Theme);
        Assert.Equal(user.Id, result.User.Id);
        Assert.False(string.IsNullOrWhiteSpace(result.AccessToken));
        Assert.Single(db.RefreshTokens);
    }

    [Fact]
    public async Task Register_DuplicateEmail_ThrowsConflict()
    {
        await using var db = NewDb();
        var service = new AuthService(db, Jwt());
        var request = new RegisterRequest("user@example.com", "StrongPass123!", "Test User");
        await service.RegisterAsync(request, null, default);
        var ex = await Assert.ThrowsAsync<AppException>(() => service.RegisterAsync(request, null, default));
        Assert.Equal(409, ex.Status);
    }

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorized()
    {
        await using var db = NewDb();
        var service = new AuthService(db, Jwt());
        await service.RegisterAsync(new RegisterRequest("user@example.com", "StrongPass123!", "Test User"), null, default);
        var ex = await Assert.ThrowsAsync<AppException>(() =>
            service.LoginAsync(new LoginRequest("user@example.com", "WrongPass123!"), null, default));
        Assert.Equal(401, ex.Status);
    }

    [Fact]
    public async Task AddUserMessage_IsIdempotent_ForSameRequestId()
    {
        await using var db = NewDb();
        var user = new ApplicationUser { Id = Guid.NewGuid(), Email = "u@e.com" };
        db.Users.Add(user);
        var chat = new Chat { Id = Guid.NewGuid(), UserId = user.Id, Title = "New chat" };
        db.Chats.Add(chat);
        await db.SaveChangesAsync();

        var service = new ChatService(db);
        var request = new SendMessageRequest("Hello", RequestId: "idem-1");
        var first = await service.AddUserMessageAsync(user.Id, chat.Id, request, default);
        var second = await service.AddUserMessageAsync(user.Id, chat.Id, request, default);

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(1, await db.ChatMessages.CountAsync());
    }

    [Fact]
    public async Task BuildContext_IncludesProjectInstructions_AndEnabledSkills()
    {
        await using var db = NewDb();
        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser { Id = userId, Email = "u@e.com" });
        var project = new Project { Id = Guid.NewGuid(), UserId = userId, Name = "P", Instructions = "Use formal tone." };
        db.Projects.Add(project);
        var chat = new Chat { Id = Guid.NewGuid(), UserId = userId, Title = "C" };
        db.Chats.Add(chat);
        db.ProjectChats.Add(new ProjectChat { ProjectId = project.Id, ChatId = chat.Id });
        var skill = new Skill { Id = Guid.NewGuid(), Name = "S", Instructions = "Be concise." };
        db.Skills.Add(skill);
        db.UserSkills.Add(new UserSkill { UserId = userId, SkillId = skill.Id, IsEnabled = true });
        db.ChatMessages.Add(new ChatMessage { ChatId = chat.Id, Role = "user", Content = "Hi" });
        await db.SaveChangesAsync();

        var context = await new ChatService(db).BuildContextAsync(userId, chat.Id, null, null, default);
        Assert.Contains("Use formal tone.", context.SystemPrompt);
        Assert.Contains("Be concise.", context.SystemPrompt);
        Assert.Single(context.Messages);
    }

    [Fact]
    public async Task BuildContext_IncludesSelectedAgentInstructions()
    {
        await using var db = NewDb();
        var userId = Guid.NewGuid();
        db.Users.Add(new ApplicationUser { Id = userId, Email = "u@e.com" });
        db.Chats.Add(new Chat { Id = Guid.NewGuid(), UserId = userId, Title = "C" });
        await db.SaveChangesAsync();
        var chatId = db.Chats.Single().Id;

        var context = await new ChatService(db).BuildContextAsync(userId, chatId, null, "coding", default);
        Assert.Contains("Coding Agent", context.SystemPrompt);

        var none = await new ChatService(db).BuildContextAsync(userId, chatId, null, null, default);
        Assert.DoesNotContain("Coding Agent", none.SystemPrompt);
    }

    [Fact]
    public async Task SkillService_SetEnabled_PersistsAndScopesToUser()
    {
        await using var db = NewDb();
        var userId = Guid.NewGuid();
        var skill = new Skill { Id = Guid.NewGuid(), Name = "Canvas Design", IsBuiltIn = true };
        db.Skills.Add(skill);
        await db.SaveChangesAsync();

        var service = new SkillService(db);
        var updated = await service.SetEnabledAsync(userId, skill.Id, true, default);
        Assert.True(updated.IsEnabled);
        var list = await service.ListAsync(userId, null, default);
        Assert.Single(list);
        Assert.True(list[0].IsEnabled);
    }

    [Fact]
    public async Task FileService_RejectsMismatchedSignature()
    {
        await using var db = NewDb();
        var service = new FileService(db, Options.Create(new FileUploadOptions
        {
            MaxBytes = 1024,
            AllowedExtensions = [".png"],
        }));
        var bytes = Encoding.UTF8.GetBytes("this is definitely not a png");
        await using var stream = new MemoryStream(bytes);
        var ex = await Assert.ThrowsAsync<AppException>(() =>
            service.UploadAsync(Guid.NewGuid(), "fake.png", "image/png", bytes.Length, stream, null, default));
        Assert.Equal(415, ex.Status);
    }

    [Fact]
    public async Task OllamaService_ParsesNdjsonStreamIntoTokens()
    {
        var ndjson = string.Join('\n', new[]
        {
            "{\"model\":\"test\",\"created_at\":\"2026-01-01\",\"message\":{\"role\":\"assistant\",\"content\":\"Hel\"},\"done\":false}",
            "{\"model\":\"test\",\"created_at\":\"2026-01-01\",\"message\":{\"role\":\"assistant\",\"content\":\"lo\"},\"done\":false}",
            "{\"model\":\"test\",\"created_at\":\"2026-01-01\",\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}",
        });
        var handler = new StubHandler(request =>
        {
            Assert.Equal("/api/chat", request.RequestUri!.AbsolutePath);
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(ndjson),
            };
        });
        var factory = new StubHttpClientFactory(handler);
        var service = new ChatPlatform.API.Services.AI.OllamaService(
            factory, Options.Create(new OllamaOptions { BaseUrl = "http://localhost:11434" }));

        var tokens = new List<string>();
        await foreach (var token in service.StreamResponseAsync(
            new ChatPlatform.API.Services.AI.AiChatRequest(
                "system", [new ChatPlatform.API.Services.ChatMessageDto("user", "hi")],
                "test", "http://localhost:11434", "", 60, 100, false), default))
            tokens.Add(token);

        Assert.Equal(["Hel", "lo"], tokens);
    }

    [Fact]
    public async Task OllamaModelSync_UsesOnlyInstalledChatModels()
    {
        await using var db = NewDb();
        var client = new StubOllamaClient(
        [
            new("qwen2.5:3b", 2_000_000_000, "qwen2", "3B", ["completion", "tools"]),
            new("nomic-embed-text:latest", 274_000_000, "nomic", "embed", ["embeddings"]),
        ]);
        var sync = new ChatPlatform.API.Services.AI.OllamaModelSync(
            db, client, Options.Create(new OllamaOptions { BaseUrl = "http://localhost:11434" }),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ChatPlatform.API.Services.AI.OllamaModelSync>.Instance);
        await sync.SyncAsync(default);

        var models = await db.AIModels.ToListAsync();
        Assert.Single(models);
        Assert.Equal("qwen2.5:3b", models[0].Name);
        Assert.Equal("ollama", (await db.AIProviders.SingleAsync()).Key);
    }

    [Fact]
    public void BuiltInSkills_MatchReferenceNames()
    {
        var names = BuiltInSkills.Definitions.Select(x => x.Name).ToList();
        Assert.Contains("Canvas Design", names);
        Assert.Contains("Skill Creator", names);
        Assert.Contains("Frontend Design", names);
        Assert.Contains("Style Skill Builder", names);
        Assert.Contains("Template Filling Skill Builder", names);
    }
}

internal sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        Task.FromResult(responder(request));
}

internal sealed class StubHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(handler) { BaseAddress = new Uri("http://localhost:11434") };
}

internal sealed class StubOllamaClient(IReadOnlyList<ChatPlatform.API.Services.AI.OllamaModelInfo> models)
    : ChatPlatform.API.Services.AI.IOllamaClient
{
    public Task<List<ChatPlatform.API.Services.AI.OllamaModelInfo>> GetInstalledModelsAsync(CancellationToken ct) =>
        Task.FromResult(models.ToList());

    public Task<ChatPlatform.API.Services.AI.OllamaModelInfo?> ShowModelAsync(string name, CancellationToken ct) =>
        Task.FromResult(models.FirstOrDefault(x => x.Name == name));
}
