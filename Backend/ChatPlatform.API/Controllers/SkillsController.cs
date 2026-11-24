using ChatPlatform.API.DTOs;
using ChatPlatform.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/skills")]
public class SkillsController(ISkillService skills) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, CancellationToken ct) =>
        Ok(await skills.ListAsync(UserId, search, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateSkillRequest request, CancellationToken ct)
    {
        var created = await skills.CreateAsync(UserId, request, ct);
        return CreatedAtAction(nameof(List), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSkillRequest request, CancellationToken ct) =>
        Ok(await skills.UpdateAsync(UserId, id, request, ct));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await skills.DeleteAsync(UserId, id, ct);
        return NoContent();
    }

    [HttpPut("{id:guid}/enabled")]
    public async Task<IActionResult> SetEnabled(Guid id, [FromBody] SetSkillEnabledRequest request, CancellationToken ct) =>
        Ok(await skills.SetEnabledAsync(UserId, id, request.IsEnabled, ct));
}

