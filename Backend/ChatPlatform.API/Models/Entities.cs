using System.ComponentModel.DataAnnotations;

namespace ChatPlatform.API.Models;

public class ApplicationUser
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(320)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(320)]
    public string NormalizedEmail { get; set; } = string.Empty;

    [MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    public byte[] PasswordHash { get; set; } = [];
    public byte[] PasswordSalt { get; set; } = [];
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<Chat> Chats { get; set; } = new List<Chat>();
    public ICollection<Project> Projects { get; set; } = new List<Project>();
    public UserSettings? Settings { get; set; }
    public ICollection<UserSkill> UserSkills { get; set; } = new List<UserSkill>();
    public ICollection<UploadedFile> UploadedFiles { get; set; } = new List<UploadedFile>();
    public ICollection<Skill> CreatedSkills { get; set; } = new List<Skill>();
}

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    [MaxLength(128)]
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    [MaxLength(64)]
    public string? CreatedByIp { get; set; }
}

public class Chat
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    [MaxLength(200)]
    public string Title { get; set; } = "New chat";
    public Guid? AIModelId { get; set; }
    public AIModel? AIModel { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    public ICollection<ProjectChat> ProjectChats { get; set; } = new List<ProjectChat>();
}

public class ChatMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ChatId { get; set; }
    public Chat Chat { get; set; } = null!;

    [MaxLength(32)]
    public string Role { get; set; } = "user";
    public string Content { get; set; } = string.Empty;

    // Used for idempotency so a retried request cannot duplicate a message.
    [MaxLength(100)]
    public string? RequestId { get; set; }
    public bool IsError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<MessageAttachment> Attachments { get; set; } = new List<MessageAttachment>();
}

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    [MaxLength(160)]
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Instructions { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<ProjectChat> ProjectChats { get; set; } = new List<ProjectChat>();
    public ICollection<UploadedFile> Files { get; set; } = new List<UploadedFile>();
}

public class ProjectChat
{
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public Guid ChatId { get; set; }
    public Chat Chat { get; set; } = null!;
    public DateTimeOffset AddedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class Skill
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(160)]
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Instructions { get; set; } = string.Empty;
    public bool IsBuiltIn { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<UserSkill> UserSkills { get; set; } = new List<UserSkill>();
}

public class UserSkill
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public Guid SkillId { get; set; }
    public Skill Skill { get; set; } = null!;
    public bool IsEnabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class AIProvider
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(160)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? BaseUrl { get; set; }
    public int TimeoutSeconds { get; set; } = 60;
    public bool SupportsStreaming { get; set; } = true;
    public bool IsEnabled { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class AIModel
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(160)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    public Guid ProviderId { get; set; }
    public AIProvider Provider { get; set; } = null!;

    [MaxLength(200)]
    public string ModelId { get; set; } = string.Empty;
    public int ContextWindow { get; set; } = 32768;
    public int MaxOutputTokens { get; set; } = 4096;
    public bool IsEnabled { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class UserSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    [MaxLength(16)]
    public string Theme { get; set; } = "light";

    [MaxLength(16)]
    public string Language { get; set; } = "en";
    public Guid? DefaultModelId { get; set; }
    public AIModel? DefaultModel { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class UploadedFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    [MaxLength(260)]
    public string OriginalFileName { get; set; } = string.Empty;

    [MaxLength(160)]
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public byte[] Bytes { get; set; } = [];

    [MaxLength(32)]
    public string FileSignature { get; set; } = string.Empty;
    public Guid? ProjectId { get; set; }
    public Project? Project { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<MessageAttachment> MessageAttachments { get; set; } = new List<MessageAttachment>();
}

public class MessageAttachment
{
    public Guid MessageId { get; set; }
    public ChatMessage Message { get; set; } = null!;
    public Guid FileId { get; set; }
    public UploadedFile File { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
