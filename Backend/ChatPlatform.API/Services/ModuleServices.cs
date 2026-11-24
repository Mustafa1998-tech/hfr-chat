using ChatPlatform.API.Data;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;

namespace ChatPlatform.API.Services;

public interface IProjectService
{
    Task<List<ProjectDto>> ListAsync(Guid userId, string? search, CancellationToken ct);
    Task<ProjectDto> GetAsync(Guid userId, Guid id, CancellationToken ct);
    Task<ProjectDto> CreateAsync(Guid userId, CreateProjectRequest request, CancellationToken ct);
    Task<ProjectDto> UpdateAsync(Guid userId, Guid id, UpdateProjectRequest request, CancellationToken ct);
    Task DeleteAsync(Guid userId, Guid id, CancellationToken ct);
    Task LinkChatAsync(Guid userId, Guid projectId, Guid chatId, CancellationToken ct);
    Task UnlinkChatAsync(Guid userId, Guid projectId, Guid chatId, CancellationToken ct);
    Task<List<ChatDto>> GetChatsAsync(Guid userId, Guid projectId, CancellationToken ct);
}

public class ProjectService(AppDbContext db) : IProjectService
{
    public async Task<List<ProjectDto>> ListAsync(Guid userId, string? search, CancellationToken ct)
    {
        var query = db.Projects.Where(x => x.UserId == userId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.Name.Contains(term) || (x.Description ?? "").Contains(term));
        }
        return await query.OrderByDescending(x => x.UpdatedAt)
            .Select(x => new ProjectDto(x.Id, x.Name, x.Description, x.Instructions, x.CreatedAt, x.UpdatedAt,
                x.ProjectChats.Count())).ToListAsync(ct);
    }

    public async Task<ProjectDto> GetAsync(Guid userId, Guid id, CancellationToken ct) => ToDto(await Owned(userId, id, ct));

    public async Task<ProjectDto> CreateAsync(Guid userId, CreateProjectRequest request, CancellationToken ct)
    {
        if (await db.Projects.AnyAsync(x => x.UserId == userId && x.Name == request.Name.Trim(), ct))
            throw new AppException("DuplicateProjectName", "A project with this name already exists.", 409);
        var project = new Project
        {
            UserId = userId,
            Name = request.Name.Trim(),
            Description = request.Description,
            Instructions = request.Instructions,
        };
        db.Projects.Add(project);
        await db.SaveChangesAsync(ct);
        return ToDto(project);
    }

    public async Task<ProjectDto> UpdateAsync(Guid userId, Guid id, UpdateProjectRequest request, CancellationToken ct)
    {
        var project = await Owned(userId, id, ct);
        if (await db.Projects.AnyAsync(x => x.UserId == userId && x.Name == request.Name.Trim() && x.Id != id, ct))
            throw new AppException("DuplicateProjectName", "A project with this name already exists.", 409);
        project.Name = request.Name.Trim();
        project.Description = request.Description;
        project.Instructions = request.Instructions;
        project.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(project);
    }

    public async Task DeleteAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var project = await Owned(userId, id, ct);
        db.Projects.Remove(project);
        await db.SaveChangesAsync(ct);
    }

    public async Task LinkChatAsync(Guid userId, Guid projectId, Guid chatId, CancellationToken ct)
    {
        _ = await Owned(userId, projectId, ct);
        if (!await db.Chats.AnyAsync(x => x.Id == chatId && x.UserId == userId, ct))
            throw new AppException("ChatNotFound", "Chat not found.", 404);
        if (!await db.ProjectChats.AnyAsync(x => x.ProjectId == projectId && x.ChatId == chatId, ct))
        {
            db.ProjectChats.Add(new ProjectChat { ProjectId = projectId, ChatId = chatId });
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task UnlinkChatAsync(Guid userId, Guid projectId, Guid chatId, CancellationToken ct)
    {
        _ = await Owned(userId, projectId, ct);
        var link = await db.ProjectChats.FirstOrDefaultAsync(x => x.ProjectId == projectId && x.ChatId == chatId, ct);
        if (link is not null)
        {
            db.ProjectChats.Remove(link);
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<List<ChatDto>> GetChatsAsync(Guid userId, Guid projectId, CancellationToken ct)
    {
        _ = await Owned(userId, projectId, ct);
        return await db.ProjectChats.Where(x => x.ProjectId == projectId)
            .Select(x => new ChatDto(x.Chat.Id, x.Chat.Title, x.Chat.AIModelId,
                x.Chat.CreatedAt, x.Chat.UpdatedAt, (Guid?)x.ProjectId))
            .ToListAsync(ct);
    }

    private async Task<Project> Owned(Guid userId, Guid id, CancellationToken ct) =>
        await db.Projects.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct)
        ?? throw new AppException("ProjectNotFound", "Project not found.", 404);

    private static ProjectDto ToDto(Project p) => new(p.Id, p.Name, p.Description, p.Instructions,
        p.CreatedAt, p.UpdatedAt, p.ProjectChats.Count);
}

public interface ISkillService
{
    Task<List<SkillDto>> ListAsync(Guid userId, string? search, CancellationToken ct);
    Task<SkillDto> CreateAsync(Guid userId, CreateSkillRequest request, CancellationToken ct);
    Task<SkillDto> UpdateAsync(Guid userId, Guid id, UpdateSkillRequest request, CancellationToken ct);
    Task DeleteAsync(Guid userId, Guid id, CancellationToken ct);
    Task<SkillDto> SetEnabledAsync(Guid userId, Guid id, bool enabled, CancellationToken ct);
}

public class SkillService(AppDbContext db) : ISkillService
{
    public async Task<List<SkillDto>> ListAsync(Guid userId, string? search, CancellationToken ct)
    {
        var query = from skill in db.Skills
                    join link in db.UserSkills.Where(x => x.UserId == userId)
                        on skill.Id equals link.SkillId into links
                    from link in links.DefaultIfEmpty()
                    where skill.IsBuiltIn || skill.CreatedByUserId == userId
                    select new { skill, enabled = link != null && link.IsEnabled };
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.skill.Name.Contains(term) || x.skill.Description.Contains(term));
        }
        var rows = await query.OrderBy(x => x.skill.Name).ToListAsync(ct);
        return rows.Select(x => new SkillDto(x.skill.Id, x.skill.Name, x.skill.Description,
            x.skill.CreatedByUserId == userId || x.skill.IsBuiltIn ? x.skill.Instructions : null,
            x.skill.IsBuiltIn, x.enabled, x.skill.UpdatedAt)).ToList();
    }

    public async Task<SkillDto> CreateAsync(Guid userId, CreateSkillRequest request, CancellationToken ct)
    {
        if (await db.Skills.AnyAsync(x => x.Name == request.Name.Trim(), ct))
            throw new AppException("DuplicateSkillName", "A skill with this name already exists.", 409);
        var skill = new Skill
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            Instructions = request.Instructions,
            IsBuiltIn = false,
            CreatedByUserId = userId,
        };
        db.Skills.Add(skill);
        db.UserSkills.Add(new UserSkill { UserId = userId, SkillId = skill.Id, IsEnabled = true });
        await db.SaveChangesAsync(ct);
        return new SkillDto(skill.Id, skill.Name, skill.Description, skill.Instructions, false, true, skill.UpdatedAt);
    }

    public async Task<SkillDto> UpdateAsync(Guid userId, Guid id, UpdateSkillRequest request, CancellationToken ct)
    {
        var skill = await OwnedCustom(userId, id, ct);
        if (await db.Skills.AnyAsync(x => x.Name == request.Name.Trim() && x.Id != id, ct))
            throw new AppException("DuplicateSkillName", "A skill with this name already exists.", 409);
        skill.Name = request.Name.Trim();
        skill.Description = request.Description;
        skill.Instructions = request.Instructions;
        skill.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        var enabled = await db.UserSkills.AnyAsync(x => x.UserId == userId && x.SkillId == id && x.IsEnabled, ct);
        return new SkillDto(skill.Id, skill.Name, skill.Description, skill.Instructions, false, enabled, skill.UpdatedAt);
    }

    public async Task DeleteAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var skill = await OwnedCustom(userId, id, ct);
        db.Skills.Remove(skill);
        await db.SaveChangesAsync(ct);
    }

    public async Task<SkillDto> SetEnabledAsync(Guid userId, Guid id, bool enabled, CancellationToken ct)
    {
        var skill = await db.Skills.FirstOrDefaultAsync(x => x.Id == id && (x.IsBuiltIn || x.CreatedByUserId == userId), ct)
            ?? throw new AppException("SkillNotFound", "Skill not found.", 404);
        var link = await db.UserSkills.FirstOrDefaultAsync(x => x.UserId == userId && x.SkillId == id, ct);
        if (link is null)
        {
            link = new UserSkill { UserId = userId, SkillId = id };
            db.UserSkills.Add(link);
        }
        link.IsEnabled = enabled;
        link.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return new SkillDto(skill.Id, skill.Name, skill.Description, skill.Instructions, skill.IsBuiltIn, enabled, skill.UpdatedAt);
    }

    private async Task<Skill> OwnedCustom(Guid userId, Guid id, CancellationToken ct) =>
        await db.Skills.FirstOrDefaultAsync(x => x.Id == id && !x.IsBuiltIn && x.CreatedByUserId == userId, ct)
        ?? throw new AppException("SkillNotFound", "Custom skill not found.", 404);
}

public interface ISettingsService
{
    Task<SettingsDto> GetAsync(Guid userId, CancellationToken ct);
    Task<SettingsDto> UpdateAsync(Guid userId, UpdateSettingsRequest request, CancellationToken ct);
}

public class SettingsService(AppDbContext db) : ISettingsService
{
    public async Task<SettingsDto> GetAsync(Guid userId, CancellationToken ct)
    {
        var settings = await db.UserSettings.FirstOrDefaultAsync(x => x.UserId == userId, ct);
        if (settings is null)
        {
            settings = new UserSettings { UserId = userId };
            db.UserSettings.Add(settings);
            await db.SaveChangesAsync(ct);
        }
        return new SettingsDto(settings.Theme, settings.Language, settings.DefaultModelId);
    }

    public async Task<SettingsDto> UpdateAsync(Guid userId, UpdateSettingsRequest request, CancellationToken ct)
    {
        var settings = await db.UserSettings.FirstOrDefaultAsync(x => x.UserId == userId, ct)
            ?? throw new AppException("SettingsNotFound", "Settings not found.", 404);
        if (request.Theme is not null) settings.Theme = request.Theme;
        if (request.Language is not null) settings.Language = request.Language;
        if (request.DefaultModelId is { } id)
        {
            if (!await db.AIModels.AnyAsync(x => x.Id == id && x.IsEnabled, ct))
                throw new AppException("ModelNotFound", "AI model not found.", 404);
            settings.DefaultModelId = id;
        }
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return new SettingsDto(settings.Theme, settings.Language, settings.DefaultModelId);
    }
}
