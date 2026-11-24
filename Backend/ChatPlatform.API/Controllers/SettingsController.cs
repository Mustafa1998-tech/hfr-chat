using ChatPlatform.API.DTOs;
using ChatPlatform.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/settings")]
public class SettingsController(ISettingsService settings) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct) => Ok(await settings.GetAsync(UserId, ct));

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateSettingsRequest request, CancellationToken ct) =>
        Ok(await settings.UpdateAsync(UserId, request, ct));
}

