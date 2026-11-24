using System.ComponentModel.DataAnnotations;

namespace ChatPlatform.API.DTOs;

public record RegisterRequest(
    [Required, EmailAddress, MaxLength(320)] string Email,
    [Required, MinLength(8), MaxLength(128)] string Password,
    [Required, MinLength(2), MaxLength(120)] string DisplayName);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password);

public record RefreshRequest([Required] string RefreshToken);

public record TokenResponse(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset ExpiresAt,
    UserDto User);

public record UserDto(Guid Id, string Email, string DisplayName);

public record UpdateProfileRequest(
    [Required, MinLength(2), MaxLength(120)] string DisplayName,
    [EmailAddress, MaxLength(320)] string? Email);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(8), MaxLength(128)] string NewPassword);

public record ChatDto(
    Guid Id,
    string Title,
    Guid? AIModelId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    Guid? ProjectId);

public record CreateChatRequest(
    [MaxLength(200)] string? Title = null,
    Guid? ProjectId = null,
    Guid? AIModelId = null);

public record RenameChatRequest([Required, MaxLength(200)] string Title);

public record SetChatModelRequest(Guid? ModelId);

public record MessageDto(
    Guid Id,
    Guid ChatId,
    string Role,
    string Content,
    bool IsError,
    DateTimeOffset CreatedAt,
    IReadOnlyList<Guid> AttachmentIds);

public record SendMessageRequest(
    [Required] string Content,
    Guid? AIModelId = null,
    IReadOnlyList<Guid>? AttachmentIds = null,
    [MaxLength(50)] string? AgentKey = null,
    [MaxLength(100)] string? RequestId = null,
    bool DeepResearch = false);

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public record ProjectDto(
    Guid Id,
    string Name,
    string? Description,
    string? Instructions,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int ChatCount);

public record CreateProjectRequest(
    [Required, MinLength(1), MaxLength(160)] string Name,
    [MaxLength(2000)] string? Description = null,
    [MaxLength(8000)] string? Instructions = null);

public record UpdateProjectRequest(
    [Required, MinLength(1), MaxLength(160)] string Name,
    [MaxLength(2000)] string? Description,
    [MaxLength(8000)] string? Instructions);

public record LinkChatRequest([Required] Guid ChatId);

public record SkillDto(
    Guid Id,
    string Name,
    string Description,
    string? Instructions,
    bool IsBuiltIn,
    bool IsEnabled,
    DateTimeOffset UpdatedAt);

public record CreateSkillRequest(
    [Required, MinLength(1), MaxLength(160)] string Name,
    [Required, MaxLength(2000)] string Description,
    [Required, MaxLength(20000)] string Instructions);

public record UpdateSkillRequest(
    [Required, MinLength(1), MaxLength(160)] string Name,
    [Required, MaxLength(2000)] string Description,
    [Required, MaxLength(20000)] string Instructions);

public record SetSkillEnabledRequest(bool IsEnabled);

public record AIModelDto(
    Guid Id,
    string Name,
    string Description,
    string ProviderKey,
    int ContextWindow,
    int MaxOutputTokens,
    bool Configured,
    bool Enabled);

public record SettingsDto(string Theme, string Language, Guid? DefaultModelId);

public record UpdateSettingsRequest(
    [RegularExpression("^(light|dark)$")] string? Theme,
    [RegularExpression("^(en|ar)$")] string? Language,
    Guid? DefaultModelId);

public record UploadedFileDto(
    Guid Id,
    string OriginalFileName,
    string ContentType,
    long Size,
    DateTimeOffset CreatedAt,
    Guid? ProjectId);

public record ErrorResponse(string Error, string? Detail = null);

public record TranslateRequest(
    [Required, MinLength(1), MaxLength(8000)] string Text,
    [Required] string From,
    [Required] string To);

public record TranslateResponse(string Translation, string From, string To);
