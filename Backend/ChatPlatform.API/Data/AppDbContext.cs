using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;

namespace ChatPlatform.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<ApplicationUser> Users => Set<ApplicationUser>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Chat> Chats => Set<Chat>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectChat> ProjectChats => Set<ProjectChat>();
    public DbSet<Skill> Skills => Set<Skill>();
    public DbSet<UserSkill> UserSkills => Set<UserSkill>();
    public DbSet<AIProvider> AIProviders => Set<AIProvider>();
    public DbSet<AIModel> AIModels => Set<AIModel>();
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();
    public DbSet<UploadedFile> UploadedFiles => Set<UploadedFile>();
    public DbSet<MessageAttachment> MessageAttachments => Set<MessageAttachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ApplicationUser>(e =>
        {
            e.HasIndex(x => x.NormalizedEmail).IsUnique();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.DisplayName).HasMaxLength(120);
        });

        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.HasOne(x => x.User).WithMany(x => x.RefreshTokens)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<Chat>(e =>
        {
            e.HasOne(x => x.User).WithMany(x => x.Chats)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.AIModel).WithMany()
                .HasForeignKey(x => x.AIModelId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.UserId, x.UpdatedAt });
        });

        modelBuilder.Entity<ChatMessage>(e =>
        {
            e.HasOne(x => x.Chat).WithMany(x => x.Messages)
                .HasForeignKey(x => x.ChatId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.ChatId, x.CreatedAt });
            e.HasIndex(x => new { x.ChatId, x.RequestId }).IsUnique()
                .HasFilter("[RequestId] IS NOT NULL");
        });

        modelBuilder.Entity<Project>(e =>
        {
            e.HasOne(x => x.User).WithMany(x => x.Projects)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
        });

        modelBuilder.Entity<ProjectChat>(e =>
        {
            e.HasKey(x => new { x.ProjectId, x.ChatId });
            e.HasOne(x => x.Project).WithMany(x => x.ProjectChats)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Chat).WithMany(x => x.ProjectChats)
                .HasForeignKey(x => x.ChatId).OnDelete(DeleteBehavior.NoAction);
            e.HasIndex(x => x.ChatId);
        });

        modelBuilder.Entity<Skill>(e =>
        {
            e.HasOne(x => x.CreatedByUser).WithMany(x => x.CreatedSkills)
                .HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<UserSkill>(e =>
        {
            e.HasKey(x => new { x.UserId, x.SkillId });
            e.HasOne(x => x.User).WithMany(x => x.UserSkills)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Skill).WithMany(x => x.UserSkills)
                .HasForeignKey(x => x.SkillId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AIProvider>(e =>
        {
            e.HasIndex(x => x.Key).IsUnique();
        });

        modelBuilder.Entity<AIModel>(e =>
        {
            e.HasOne(x => x.Provider).WithMany()
                .HasForeignKey(x => x.ProviderId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<UserSettings>(e =>
        {
            e.HasOne(x => x.User).WithOne(x => x.Settings)
                .HasForeignKey<UserSettings>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasOne(x => x.DefaultModel).WithMany()
                .HasForeignKey(x => x.DefaultModelId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<UploadedFile>(e =>
        {
            e.HasOne(x => x.User).WithMany(x => x.UploadedFiles)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.Project).WithMany(x => x.Files)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
        });

        modelBuilder.Entity<MessageAttachment>(e =>
        {
            e.HasKey(x => new { x.MessageId, x.FileId });
            e.HasOne(x => x.Message).WithMany(x => x.Attachments)
                .HasForeignKey(x => x.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.File).WithMany(x => x.MessageAttachments)
                .HasForeignKey(x => x.FileId).OnDelete(DeleteBehavior.NoAction);
        });
    }
}
