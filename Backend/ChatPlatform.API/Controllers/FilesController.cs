using ChatPlatform.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/files")]
public class FilesController(IFileService files) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? projectId, CancellationToken ct) =>
        Ok(await files.ListAsync(UserId, projectId, ct));

    [HttpPost("upload")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, [FromQuery] Guid? projectId, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "NoFile", message = "A file is required." });
        var uploaded = await files.UploadAsync(UserId, file.FileName, file.ContentType ?? "application/octet-stream",
            file.Length, file.OpenReadStream(), projectId, ct);
        return Ok(uploaded);
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var (file, contentType) = await files.GetForDownloadAsync(UserId, id, ct);
        return File(file.Bytes, contentType, file.OriginalFileName);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await files.DeleteAsync(UserId, id, ct);
        return NoContent();
    }
}

