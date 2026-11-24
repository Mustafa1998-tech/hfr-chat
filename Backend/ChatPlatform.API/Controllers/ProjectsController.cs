using ChatPlatform.API.DTOs;
using ChatPlatform.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects")]
public class ProjectsController(IProjectService projects, IFileService files) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, CancellationToken ct) =>
        Ok(await projects.ListAsync(UserId, search, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await projects.GetAsync(UserId, id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest request, CancellationToken ct)
    {
        var created = await projects.CreateAsync(UserId, request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProjectRequest request, CancellationToken ct) =>
        Ok(await projects.UpdateAsync(UserId, id, request, ct));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await projects.DeleteAsync(UserId, id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/chats")]
    public async Task<IActionResult> Link(Guid id, [FromBody] LinkChatRequest request, CancellationToken ct)
    {
        await projects.LinkChatAsync(UserId, id, request.ChatId, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}/chats/{chatId:guid}")]
    public async Task<IActionResult> Unlink(Guid id, Guid chatId, CancellationToken ct)
    {
        await projects.UnlinkChatAsync(UserId, id, chatId, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/chats")]
    public async Task<IActionResult> Chats(Guid id, CancellationToken ct) => Ok(await projects.GetChatsAsync(UserId, id, ct));

    [HttpGet("{id:guid}/files")]
    public async Task<IActionResult> Files(Guid id, CancellationToken ct) => Ok(await files.ListAsync(UserId, id, ct));
}

