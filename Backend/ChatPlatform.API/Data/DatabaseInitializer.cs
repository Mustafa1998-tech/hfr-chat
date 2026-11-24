using ChatPlatform.API.Models;
using ChatPlatform.API.Services.AI;
using Microsoft.EntityFrameworkCore;

namespace ChatPlatform.API.Data;

public static class DatabaseInitializer
{
    /// <summary>
    /// Applies migrations, discovers installed Ollama models and seeds built-in skills.
    /// No users, chats, projects or conversations are seeded.
    /// </summary>
    public static async Task InitialiseAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var provider = scope.ServiceProvider;
        var db = provider.GetRequiredService<AppDbContext>();
        var logger = provider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseInitializer");

        await db.Database.MigrateAsync(ct);
        await provider.GetRequiredService<IOllamaModelSync>().SyncAsync(ct);

        foreach (var definition in BuiltInSkills.Definitions)
        {
            var skill = await db.Skills.FirstOrDefaultAsync(x => x.Name == definition.Name, ct);
            if (skill is null)
            {
                db.Skills.Add(new Skill
                {
                    Name = definition.Name,
                    Description = definition.Description,
                    Instructions = definition.Instructions,
                    IsBuiltIn = true,
                });
            }
            else
            {
                skill.Description = definition.Description;
                skill.Instructions = definition.Instructions;
                skill.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Database initialised. Ollama models: {Models}, built-in skills: {Skills}",
            await db.AIModels.CountAsync(ct), BuiltInSkills.Definitions.Count);
    }
}

public record BuiltInSkillDefinition(string Name, string Description, string Instructions);

public static class BuiltInSkills
{
    // Definitions mirror the labels shown in the reference UI. Instructions are prompt
    // guidance only — no arbitrary code or shell execution is implemented.
    public static readonly IReadOnlyList<BuiltInSkillDefinition> Definitions =
    [
        new("Canvas Design",
            "Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design, or other static piece. Creates original visual designs, never copying existing artwork or brand assets.",
            "When asked for a poster, artwork or static visual design, describe a distinctive composition, palette and typography. Produce original descriptions rather than copying existing work."),
        new("Skill Creator",
            "Create new skills, modify and improve existing skills, and measure skill performance. Triggers: create a skill, build a skill, new skill, edit skill, modify skill, optimize skill, skill eval, test skill, benchmark skill. Do NOT trigger on unrelated requests.",
            "Help the user author a clear skill name, trigger conditions, scope and step-by-step instructions. Never claim capabilities that are not actually available."),
        new("Frontend Design",
            "Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications such as websites and landing pages.",
            "When asked to build web components, pages or applications, prioritise hierarchy, spacing, typography, accessibility and responsive behaviour. Follow the supplied design tokens and reference images."),
        new("Style Skill Builder",
            "Create a REUSABLE style skill from an uploaded design sample (HTML/PXTX/PDF) so future decks and documents match that brand's look without re-uploading the file. Use when the user uploads a sample and asks to save this style.",
            "Summarise the visual rules of a supplied sample (colours, type scale, radii, spacing) as reusable prompt instructions. Do not execute any uploaded code."),
        new("Template Filling Skill Builder",
            "Create a reusable skill from an uploaded template (CSV, letter, report, invoice, form, memo) that fills that exact template with new information while preserving its layout and styling. Use when the user uploads a document and asks to fill it.",
            "Describe how to preserve a template's layout and styling while replacing placeholders with the user's data. Never claim document parsing that has not been implemented."),
    ];
}
