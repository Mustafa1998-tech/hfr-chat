using ChatPlatform.API.Data;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;

namespace ChatPlatform.API.Services;

public interface IChatService
{
    Task<PagedResult<ChatDto>> ListAsync(Guid userId, string? search, int page, int pageSize, string? sort, CancellationToken ct);
    Task<ChatDto> CreateAsync(Guid userId, CreateChatRequest request, CancellationToken ct);
    Task<ChatDto> RenameAsync(Guid userId, Guid chatId, string title, CancellationToken ct);
    Task<ChatDto> SetModelAsync(Guid userId, Guid chatId, Guid? modelId, CancellationToken ct);
    Task DeleteAsync(Guid userId, Guid chatId, CancellationToken ct);
    Task<List<MessageDto>> GetMessagesAsync(Guid userId, Guid chatId, int page, int pageSize, CancellationToken ct);
    Task<MessageDto> AddUserMessageAsync(Guid userId, Guid chatId, SendMessageRequest request, CancellationToken ct);
    Task<AssistantContext> BuildContextAsync(Guid userId, Guid chatId, IReadOnlyList<Guid>? attachmentIds, string? agentKey, CancellationToken ct);
    Task<MessageDto> PersistAssistantAsync(Guid userId, Guid chatId, string content, string requestId, bool isError, CancellationToken ct);
    Task<ChatDto?> GetAsync(Guid userId, Guid chatId, CancellationToken ct);
}

public record AssistantContext(List<ChatMessageDto> Messages, string SystemPrompt, string? ModelName, Guid? ModelId);

public record ChatMessageDto(string Role, string Content);

public class ChatService(AppDbContext db) : IChatService
{
    public async Task<PagedResult<ChatDto>> ListAsync(Guid userId, string? search, int page, int pageSize, string? sort, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Chats.Where(x => x.UserId == userId).AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.Title.Contains(term)
                || x.Messages.Any(m => m.Content.Contains(term)));
        }
        query = sort switch
        {
            "title" => query.OrderBy(x => x.Title),
            "created" => query.OrderByDescending(x => x.CreatedAt),
            _ => query.OrderByDescending(x => x.UpdatedAt),
        };

        var total = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new ChatDto(
                x.Id, x.Title, x.AIModelId, x.CreatedAt, x.UpdatedAt,
                x.ProjectChats.Select(pc => (Guid?)pc.ProjectId).FirstOrDefault()))
            .ToListAsync(ct);
        return new PagedResult<ChatDto>(items, total, page, pageSize);
    }

    public async Task<ChatDto?> GetAsync(Guid userId, Guid chatId, CancellationToken ct) =>
        await db.Chats.Where(x => x.Id == chatId && x.UserId == userId)
            .Select(x => new ChatDto(
                x.Id, x.Title, x.AIModelId, x.CreatedAt, x.UpdatedAt,
                x.ProjectChats.Select(pc => (Guid?)pc.ProjectId).FirstOrDefault()))
            .FirstOrDefaultAsync(ct);

    public async Task<ChatDto> CreateAsync(Guid userId, CreateChatRequest request, CancellationToken ct)
    {
        var chat = new Chat
        {
            UserId = userId,
            Title = string.IsNullOrWhiteSpace(request.Title) ? "New chat" : request.Title.Trim(),
            AIModelId = request.AIModelId,
        };
        db.Chats.Add(chat);
        if (request.ProjectId is { } projectId)
        {
            var owned = await db.Projects.AnyAsync(x => x.Id == projectId && x.UserId == userId, ct);
            if (!owned) throw new AppException("ProjectNotFound", "Project not found.", 404);
            db.ProjectChats.Add(new ProjectChat { ProjectId = projectId, ChatId = chat.Id });
        }
        await db.SaveChangesAsync(ct);
        return new ChatDto(chat.Id, chat.Title, chat.AIModelId, chat.CreatedAt, chat.UpdatedAt, request.ProjectId);
    }

    public async Task<ChatDto> RenameAsync(Guid userId, Guid chatId, string title, CancellationToken ct)
    {
        var chat = await OwnedChat(userId, chatId, ct);
        chat.Title = title.Trim();
        chat.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return new ChatDto(chat.Id, chat.Title, chat.AIModelId, chat.CreatedAt, chat.UpdatedAt,
            await db.ProjectChats.Where(x => x.ChatId == chatId).Select(x => (Guid?)x.ProjectId).FirstOrDefaultAsync(ct));
    }

    public async Task<ChatDto> SetModelAsync(Guid userId, Guid chatId, Guid? modelId, CancellationToken ct)
    {
        var chat = await OwnedChat(userId, chatId, ct);
        if (modelId is { } id && !await db.AIModels.AnyAsync(x => x.Id == id && x.IsEnabled, ct))
            throw new AppException("ModelNotFound", "AI model not found or disabled.", 404);
        chat.AIModelId = modelId;
        chat.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return new ChatDto(chat.Id, chat.Title, chat.AIModelId, chat.CreatedAt, chat.UpdatedAt,
            await db.ProjectChats.Where(x => x.ChatId == chatId).Select(x => (Guid?)x.ProjectId).FirstOrDefaultAsync(ct));
    }

    public async Task DeleteAsync(Guid userId, Guid chatId, CancellationToken ct)
    {
        var chat = await OwnedChat(userId, chatId, ct);
        db.Chats.Remove(chat);
        await db.SaveChangesAsync(ct);
    }

    public async Task<List<MessageDto>> GetMessagesAsync(Guid userId, Guid chatId, int page, int pageSize, CancellationToken ct)
    {
        _ = await OwnedChat(userId, chatId, ct);
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var items = await db.ChatMessages
            .Where(x => x.ChatId == chatId)
            .OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);
        items.Reverse();
        return items.Select(ToDto).ToList();
    }

    public async Task<MessageDto> AddUserMessageAsync(Guid userId, Guid chatId, SendMessageRequest request, CancellationToken ct)
    {
        var chat = await OwnedChat(userId, chatId, ct);
        if (!string.IsNullOrWhiteSpace(request.RequestId))
        {
            var existing = await db.ChatMessages
                .FirstOrDefaultAsync(x => x.ChatId == chatId && x.RequestId == request.RequestId, ct);
            if (existing is not null) return ToDto(existing);
        }

        var message = new ChatMessage
        {
            ChatId = chatId,
            Role = "user",
            Content = request.Content.Trim(),
            RequestId = string.IsNullOrWhiteSpace(request.RequestId) ? null : request.RequestId,
        };
        db.ChatMessages.Add(message);
        if (request.AttachmentIds?.Count > 0)
        {
            var ids = request.AttachmentIds.Distinct().ToList();
            var ownedFiles = await db.UploadedFiles
                .Where(x => x.UserId == userId && ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct);
            foreach (var fileId in ownedFiles)
                db.MessageAttachments.Add(new MessageAttachment { MessageId = message.Id, FileId = fileId });
        }
        chat.UpdatedAt = DateTimeOffset.UtcNow;
        if (request.AIModelId is { } selectedModel &&
            await db.AIModels.AnyAsync(x => x.Id == selectedModel && x.IsEnabled, ct))
            chat.AIModelId = selectedModel;
        await db.SaveChangesAsync(ct);

        // A new chat appears in the sidebar after the first message is saved.
        if (chat.Title == "New chat")
            chat.Title = Truncate(request.Content.Trim(), 60);
        await db.SaveChangesAsync(ct);
        return ToDto(message);
    }

    public async Task<AssistantContext> BuildContextAsync(
        Guid userId, Guid chatId, IReadOnlyList<Guid>? attachmentIds, string? agentKey, CancellationToken ct)
    {
        var chat = await OwnedChat(userId, chatId, ct);
        var history = await db.ChatMessages
            .Where(x => x.ChatId == chatId && !x.IsError && x.Content != "")
            .OrderBy(x => x.CreatedAt).Take(100)
            .Select(x => new ChatMessageDto(x.Role, x.Content)).ToListAsync(ct);

        var project = await db.ProjectChats
            .Where(pc => pc.ChatId == chatId && pc.Project.UserId == userId)
            .Select(pc => new { pc.Project.Instructions, pc.ProjectId })
            .FirstOrDefaultAsync(ct);

        var skillInstructions = await db.UserSkills
            .Where(us => us.UserId == userId && us.IsEnabled)
            .Select(us => us.Skill.Instructions).ToListAsync(ct);

        var model = chat.AIModelId is { } id
            ? await db.AIModels.Where(x => x.Id == id && x.IsEnabled).Select(x => new { x.Name, x.Id }).FirstOrDefaultAsync(ct)
            : null;

        var parts = new List<string>();
        if (ChatPlatform.API.Services.AI.AgentDefinitions.Get(agentKey) is { } agentInstructions)
            parts.Add("Active agent instructions:\n" + agentInstructions);
        if (!string.IsNullOrWhiteSpace(project?.Instructions))
            parts.Add("Project instructions:\n" + project!.Instructions);
        if (skillInstructions.Count > 0)
            parts.Add("Enabled skill instructions (these change how you respond):\n" +
                      string.Join("\n\n", skillInstructions));

        if (project is not null)
        {
            var projectFileNames = await db.UploadedFiles
                .Where(x => x.ProjectId == project.ProjectId && x.UserId == userId)
                .OrderBy(x => x.OriginalFileName)
                .Select(x => x.OriginalFileName).Take(30).ToListAsync(ct);
            if (projectFileNames.Count > 0)
                parts.Add("Documents available in this project (ask the user to select one as context):\n" +
                          string.Join(", ", projectFileNames));
        }

        // Only explicitly selected, text-based documents are placed in the prompt.
        // Binary files (PDF/images/Office) are never sent as raw bytes or decoded text.
        if (attachmentIds?.Count > 0)
        {
            var ids = attachmentIds.Distinct().ToList();
            var files = await db.UploadedFiles
                .Where(x => x.UserId == userId && ids.Contains(x.Id))
                .Select(x => new { x.OriginalFileName, x.ContentType, x.Bytes }).ToListAsync(ct);
            var total = 0;
            foreach (var file in files)
            {
                var extension = Path.GetExtension(file.OriginalFileName).ToLowerInvariant();
                if (extension is ".txt" or ".md" or ".csv" or ".json")
                {
                    var text = System.Text.Encoding.UTF8.GetString(file.Bytes);
                    const int maxChars = 12000;
                    if (text.Length > maxChars) text = text[..maxChars] + "\n[truncated]";
                    total += text.Length;
                    if (total > 24000) break;
                    parts.Add($"Selected document '{file.OriginalFileName}':\n{text}");
                }
                else
                {
                    parts.Add($"Selected file '{file.OriginalFileName}' ({file.ContentType}) was attached. " +
                              "Its contents cannot be read as text; no document parser is configured.");
                }
            }
        }

        return new AssistantContext(history, string.Join("\n\n", parts), model?.Name, model?.Id);
    }

    public async Task<MessageDto> PersistAssistantAsync(Guid userId, Guid chatId, string content, string requestId, bool isError, CancellationToken ct)
    {
        _ = await OwnedChat(userId, chatId, ct);
        var existing = await db.ChatMessages
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.RequestId == requestId, ct);
        if (existing is not null) return ToDto(existing);

        var message = new ChatMessage
        {
            ChatId = chatId,
            Role = isError ? "system" : "assistant",
            Content = content,
            IsError = isError,
            RequestId = requestId,
        };
        db.ChatMessages.Add(message);
        await db.SaveChangesAsync(ct);
        return ToDto(message);
    }

    private async Task<Chat> OwnedChat(Guid userId, Guid chatId, CancellationToken ct) =>
        await db.Chats.FirstOrDefaultAsync(x => x.Id == chatId && x.UserId == userId, ct)
        ?? throw new AppException("ChatNotFound", "Chat not found.", 404);

    private static MessageDto ToDto(ChatMessage m) => new(
        m.Id, m.ChatId, m.Role, m.Content, m.IsError, m.CreatedAt,
        m.Attachments.Select(a => a.FileId).ToList());

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max].TrimEnd() + "…";
}
