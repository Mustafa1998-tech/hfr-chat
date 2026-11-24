using ChatPlatform.API.Configuration;
using ChatPlatform.API.Data;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChatPlatform.API.Services;

public interface IFileService
{
    Task<UploadedFileDto> UploadAsync(Guid userId, string fileName, string contentType, long length,
        Stream stream, Guid? projectId, CancellationToken ct);
    Task<List<UploadedFileDto>> ListAsync(Guid userId, Guid? projectId, CancellationToken ct);
    Task<(UploadedFile File, string ContentType)> GetForDownloadAsync(Guid userId, Guid id, CancellationToken ct);
    Task DeleteAsync(Guid userId, Guid id, CancellationToken ct);
}

public class FileService(AppDbContext db, IOptions<FileUploadOptions> options) : IFileService
{
    private readonly FileUploadOptions _options = options.Value;

    public async Task<UploadedFileDto> UploadAsync(Guid userId, string fileName, string contentType,
        long length, Stream stream, Guid? projectId, CancellationToken ct)
    {
        if (length <= 0) throw new AppException("EmptyFile", "The file is empty.", 400);
        if (length > _options.MaxBytes)
            throw new AppException("FileTooLarge", $"Files must be smaller than {_options.MaxBytes / 1024 / 1024} MB.", 413);

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!_options.AllowedExtensions.Contains(extension))
            throw new AppException("FileTypeNotAllowed", $"File type '{extension}' is not allowed.", 415);

        if (projectId is { } pid &&
            !await db.Projects.AnyAsync(x => x.Id == pid && x.UserId == userId, ct))
            throw new AppException("ProjectNotFound", "Project not found.", 404);

        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, ct);
        var bytes = memory.ToArray();
        if (bytes.Length != length)
            throw new AppException("InvalidFileLength", "Uploaded file length does not match the request.", 400);

        var signature = DetectSignature(bytes, extension, contentType);
        if (signature is null)
            throw new AppException("InvalidFileSignature", "File content does not match its declared type.", 415);

        var file = new UploadedFile
        {
            UserId = userId,
            OriginalFileName = Path.GetFileName(fileName),
            ContentType = contentType,
            Size = bytes.Length,
            Bytes = bytes,
            FileSignature = signature,
            ProjectId = projectId,
        };
        db.UploadedFiles.Add(file);
        await db.SaveChangesAsync(ct);
        return ToDto(file);
    }

    public async Task<List<UploadedFileDto>> ListAsync(Guid userId, Guid? projectId, CancellationToken ct)
    {
        var query = db.UploadedFiles.Where(x => x.UserId == userId);
        if (projectId is { } pid) query = query.Where(x => x.ProjectId == pid);
        return await query.OrderByDescending(x => x.CreatedAt)
            .Select(x => new UploadedFileDto(x.Id, x.OriginalFileName, x.ContentType, x.Size, x.CreatedAt, x.ProjectId))
            .ToListAsync(ct);
    }

    public async Task<(UploadedFile File, string ContentType)> GetForDownloadAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var file = await db.UploadedFiles.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct)
            ?? throw new AppException("FileNotFound", "File not found.", 404);
        return (file, file.ContentType);
    }

    public async Task DeleteAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var file = await db.UploadedFiles.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct)
            ?? throw new AppException("FileNotFound", "File not found.", 404);
        db.UploadedFiles.Remove(file);
        await db.SaveChangesAsync(ct);
    }

    private static string? DetectSignature(byte[] bytes, string extension, string contentType)
    {
        static bool Starts(byte[] b, params byte[] prefix) =>
            b.Length >= prefix.Length && prefix.Where((t, i) => b[i] != t).Any() == false;

        if (Starts(bytes, 0x89, 0x50, 0x4E, 0x47)) return extension == ".png" ? "png" : null;
        if (Starts(bytes, 0xFF, 0xD8, 0xFF)) return extension is ".jpg" or ".jpeg" ? "jpeg" : null;
        if (Starts(bytes, 0x25, 0x50, 0x44, 0x46)) return extension == ".pdf" ? "pdf" : null;
        if (Starts(bytes, 0x50, 0x4B, 0x03, 0x04)) return extension is ".docx" or ".xlsx" ? "zip" : null;

        if (extension is ".txt" or ".md" or ".csv" or ".json")
        {
            if (Array.IndexOf(bytes, (byte)0) >= 0) return null;
            try { _ = System.Text.Encoding.UTF8.GetString(bytes); return "text"; }
            catch { return null; }
        }
        return null;
    }

    private static UploadedFileDto ToDto(UploadedFile f) =>
        new(f.Id, f.OriginalFileName, f.ContentType, f.Size, f.CreatedAt, f.ProjectId);
}
